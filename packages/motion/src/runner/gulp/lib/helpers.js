import chalk from 'chalk'
import _gulp from 'gulp'
import _through from 'through2'
import loadPlugins from 'gulp-load-plugins'
import { _, path, log } from '../../lib/fns'
import opts from '../../opts'
import cache from '../../cache'
import scriptsGlob from './scriptsGlob'
import merge from 'merge-stream'
import multipipe from 'multipipe'

export const isSourceMap = file => path.extname(file) === '.map'
export const relative = file => path.relative(opts('appDir'), file.path)
export const time = _ => typeof _ == 'number' ? ` ${_}ms` : ''
export const out = {}
out.badFile = (file, err) => print(`  ✖ ${relative(file)}`.red),
out.goodFile = symbol => (file, ms) =>
  print(
    `  ${chalk.dim(symbol)}${relative(file)} `
    + chalk.dim(file.startTime ? time((Date.now() - file.startTime) || 1).dim : '')
  )
out.goodScript = out.goodFile('')

export const $ = loadPlugins()

$.filterEmptyDirs = $.if(file => !file.stat.isFile(), $.ignore.exclude(true))
$.merge = merge
$.multipipe = multipipe
$.fn = logfn

export const isProduction = () => opts('build')

export const through = _through
export const gulp = _gulp
export const SCRIPTS_GLOB = scriptsGlob

function logfn(fn) {
  return _through.obj(function(file, enc, next) {
    let result = fn && fn(file)

    if (typeof result == 'string') {
      file.contents = new Buffer(result)
      next(null, file)
      return
    }

    next(null, file)
  })
}