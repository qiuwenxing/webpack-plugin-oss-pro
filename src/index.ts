import path from 'path'
import fs from 'fs'
import OSS from 'ali-oss'
import globby from 'globby'
import Listr from 'listr'
import { glob } from 'glob'
import 'colors'
import { PluginOptions, defaultOption } from './type'

/**
 * 需要上传的文件后缀
 */
const _fileSuffix = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp', 'webm', 'avi', 'mp4', 'mp3', 'flv', 'mov']

const pluginName = 'WebpackPluginOssPro'

class WebpackPluginOssPro {

  config: PluginOptions
  configErrStr: string
  client: OSS
  filesUploaded: any[] = []
  filesIgnored: any[] = []
  filesErrors: any[] = []


  constructor(options: PluginOptions) {
    const {
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
    } = options;

    this.config = Object.assign(defaultOption, options);

    this.configErrStr = this.checkOptions(options);
    this.client = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
    });

    this.filesUploaded = []
    this.filesIgnored = []
  }

  apply(compiler: any) {
    if (compiler) {
      return this.doWithWebpack(compiler);
    }
  }

  doWithWebpack(compiler: any) {
    // 更改CDN地址
    compiler.hooks.afterPlugins.tap(pluginName, (compilation: any) => {
      const { cdnHost, fileSuffix, dist } = this.config
      const suffix = fileSuffix || _fileSuffix
      const url = new URL(dist || '', cdnHost)
      const cdnBaseUrl = url.href + '/'
      const regExp = new RegExp(`\.(${suffix.join('|')})$`, 'i')
      compiler.options.module.rules.push({
        test: regExp,
        type: 'asset',
        generator: {
          publicPath: cdnBaseUrl,
        },
      })
    })
    // 上传资源文件到oss
    compiler.hooks.afterEmit.tapPromise(pluginName, async (compilation: any) => {
      if (this.configErrStr) {
        compilation.errors.push(this.configErrStr);
        return Promise.resolve();
      }
      const outputPath = path.resolve(this.slash(compiler.options.output.path));
      const { from = outputPath + '/**' } = this.config;

      const files = await globby(from, { dot: true });

      if (files.length) {
        try {
          await this.upload(files, true, outputPath);
          console.log('');
          console.log(' All files uploaded successfully '.bgGreen.white.bold);


        } catch (err) {
          compilation.errors.push(err);
          return Promise.reject(err);
        }
      } else {
        console.log('no files to be uploaded');
        return Promise.resolve('no files to be uploaded');
      }
    });
  }

  async upload(files: any, inWebpack?: any, outputPath = '') {
    const {
      dist,
      deleteOrigin,
      setOssPath,
      timeout,
      test,
      overwrite,
      quitWpOnError,
      parallel,
    } = this.config;

    if (test) {
      console.log('');
      console.log('Currently running in test mode. your files won\'t realy be uploaded.'.green.underline);
      console.log('');
    } else {
      console.log('');
      console.log('Your files will be uploaded very soon.'.green.underline);
      console.log('');
    }

    files = files.map((file: any) => ({
      path: file,
      fullPath: path.resolve(file)
    }))

    this.filesUploaded = []
    this.filesIgnored = []
    this.filesErrors = []

    const basePath = this.getBasePath(inWebpack, outputPath)

    const _upload = async (file: any) => {
      const { fullPath: filePath, path: fPath } = file

      let ossFilePath = this.slash(
        path.join(
          dist || '',
          (
            setOssPath && setOssPath(filePath)
            || basePath && filePath.split(basePath)[1]
            || ''
          )
        )
      );

      if (test) {
        return Promise.resolve(fPath.blue.underline + ' is ready to upload to ' + ossFilePath.green.underline);
      }

      if (!overwrite) {
        const fileExists = await this.fileExists(ossFilePath)
        if (fileExists) {
          this.filesIgnored.push(filePath)
          return Promise.resolve(fPath.blue.underline + ' ready exists in oss, ignored');
        }
      }

      const headers = {
        'Cache-Control': 'max-age=31536000'
      }
      let result
      try {
        result = await this.client.put(ossFilePath, filePath, {
          timeout,
          // headers: !overwrite ? Object.assign(headers, { 'x-oss-forbid-overwrite': true }) : headers
          headers
        })
      } catch (err: any) {
        // if (err.name === 'FileAlreadyExistsError') {
        // 	this.filesIgnored.push(filePath)
        // 	return Promise.resolve(fPath.blue.underline + ' ready exists in oss, ignored');
        // }

        this.filesErrors.push({
          file: fPath,
          err: { code: err.code, message: err.message, name: err.name }
        });

        const errorMsg = `Failed to upload ${fPath.underline}: ` + `${err.name}-${err.code}: ${err.message}`.red;
        return Promise.reject(new Error(errorMsg))
      }

      result.url = this.normalize(result.url);
      this.filesUploaded.push(fPath)

      if (deleteOrigin) {
        fs.unlinkSync(filePath);
        this.deleteEmptyDir(filePath);
      }

      return Promise.resolve(fPath.blue.underline + ' successfully uploaded, oss url => ' + result.url.green)
    }

    let len = parallel
    const addTask = () => {
      if (len < files.length) {
        tasks.add(createTask(files[len]))
        len++
      }
    }
    const createTask = (file: any) => ({
      title: `uploading ${file.path.underline}`,
      task(_: any, task: any) {
        return _upload(file)
          .then(msg => {
            task.title = msg;
            addTask()
          })
          .catch(e => {
            if (!quitWpOnError) addTask()
            return Promise.reject(e)
          })
      }
    });
    const tasks = new Listr(
      files.slice(0, len).map(createTask),
      {
        exitOnError: quitWpOnError,
        concurrent: parallel
      })

    await tasks.run().catch(() => { });

    // this.filesIgnored.length && console.log('files ignored due to not overwrite'.blue, this.filesIgnored);

    if (this.filesErrors.length) {
      console.log(' UPLOAD ENDED WITH ERRORS '.bgRed.white, '\n');

      return Promise.reject(' UPLOAD ENDED WITH ERRORS ')
    }
  }

  getBasePath(inWebpack: any, outputPath: any) {
    if (this.config.setOssPath) return '';

    let basePath = ''

    if (inWebpack) {
      if (path.isAbsolute(outputPath)) basePath = outputPath
      else basePath = path.resolve(outputPath)
    } else {
      const { buildRoot } = this.config
      if (buildRoot) {
        if (path.isAbsolute(buildRoot)) basePath = buildRoot
        else basePath = path.resolve(buildRoot)
      }
    }

    return this.slash(basePath)
  }

  fileExists(filepath: string) {
    // return this.client.get(filepath)
    return this.client.head(filepath)
      .then((result: any) => {
        return result.res.status == 200
      }).catch((e: any) => {
        if (e.code == 'NoSuchKey') return false
      })
  }

  normalize(url: string) {
    const tmpArr = url.split(/\/{2,}/);
    if (tmpArr.length >= 2) {
      const [protocol, ...rest] = tmpArr;
      url = protocol + '//' + rest.join('/');
    }
    return url;
  }

  slash(path: string) {
    const isExtendedLengthPath = /^\\\\\?\\/.test(path);
    // const hasNonAscii = /[^\u0000-\u0080]+/.test(path);

    if (isExtendedLengthPath) {
      return path;
    }

    return path.replace(/\\/g, '/');
  }

  deleteEmptyDir(filePath: string) {
    let dirname = path.dirname(filePath);
    if (fs.existsSync(dirname) && fs.statSync(dirname).isDirectory()) {
      fs.readdir(dirname, (err, files) => {
        if (err) console.error(err);
        else {
          if (!files.length) fs.rmdir(dirname, () => { })
        }
      })
    }
  }

  checkOptions(options: PluginOptions) {
    let {
      from,
      dist,
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
      cdnHost
    } = options;

    let errStr = '';

    if (!region) errStr += '\nregion not specified';
    if (!accessKeyId) errStr += '\naccessKeyId not specified';
    if (!accessKeySecret) errStr += '\naccessKeySecret not specified';
    if (!bucket) errStr += '\nbucket not specified';
    if (!dist) errStr += '\ndist not specified';
    if (!cdnHost) errStr += '\ncdnHost not specified';

    if (Array.isArray(from)) {
      if (from.some(g => typeof g !== 'string')) errStr += '\neach item in from should be a glob string';
    } else {
      let fromType = typeof from;
      if (['undefined', 'string'].indexOf(fromType) === -1) errStr += '\nfrom should be string or array';
    }

    return errStr;
  }
  //替换cdn地址
  async writeBundle() {
    const { cdnHost, fileSuffix, dist } = this.config
    if (cdnHost) {
      const suffix = fileSuffix || _fileSuffix
      const url = new URL(dist || '', cdnHost)
      const cdnBaseUrl = url.href
      console.log('cdnBaseUrl:', cdnBaseUrl);
      const regExp = new RegExp(`(img\/[A-Za-z0-9_.-]+\.(${suffix.join('|')}))`, 'ig')
      console.log('RegExp:', regExp)
      // 获取构建后的文件列表
      const fileList = await glob.sync('./dist/**/*.{js,css,html}')
      // 遍历文件列表
      fileList.forEach((filePath) => {
        // 读取文件内容
        const fileContent = fs.readFileSync(filePath, 'utf-8')

        // 查找并替换所有引用的图片路径
        const newFileContent = fileContent.replace(regExp, `${cdnBaseUrl}/$1`)

        fileContent.match(regExp)?.forEach(item => {
          console.log(item);
        })

        // 写入修改后的文件内容
        fs.writeFileSync(filePath, newFileContent, 'utf-8')
      })

      return true
    }
    return false
  }
}

export = WebpackPluginOssPro