import runner from './shutdown'
import open from 'open'
import keypress from 'keypress'

import log from './lib/log'
import openInBrowser from './lib/openInBrowser'
import handleError from './lib/handleError'
import editor from './lib/editor'
import opts from './opts'
import bundler from './bundler'
import cache from './cache'

const proc = process // cache for keypress

export function init() {
  start()
  banner()
}

export function banner() {
  const newLine = "\n"
  const userEditor = (process.env.VISUAL || process.env.EDITOR)

  const prefix = '  ›'

  console.log(
    `${prefix} `+'O'.cyan.bold + 'pen   '.cyan +
      `${prefix} `.dim+'V'.bold.dim + 'erbose'.dim + newLine +
    (userEditor
      ? (`${prefix} `+'E'.cyan.bold + 'ditor '.cyan)
      : '         ') +
        `${prefix} `.dim+'R'.bold.dim+'ebundle'.dim + newLine
    // `${prefix} `+'U'.blue.bold + 'pload'.blue + newLine
  )

  resume()
}

function start() {
  let OPTS = opts.get()

  if (!proc.stdin.isTTY || OPTS.isBuild)
    return

  keypress(proc.stdin)

  // listen for the "keypress" event
  proc.stdin.on('keypress', async function (ch, key) {
    if (!key) return
    log('keypress', key.name)

    try {
      switch(key.name) {
        case 'return': // show banner again
          console.log()
          banner()
          break
        case 'o': // open browser
          openInBrowser(true)
          break
        case 'e': // open editor
          try {
            editor('.')
          }
          catch(e) {
            console.log('Error running your editor, make sure your shell EDITOR variable is set')
          }

          break
        case 'r': // bundler
          console.log('Re-bundling internals and npm packages...')
          await bundler.install(true)
          console.log(`Done!\n`)
          break
        case 'v': // verbose logging
          opts.set('debug', !opts.get('debug'))
          log.setLogging()
          console.log(opts.get('debug') ? 'Set to log verbose'.yellow : 'Set to log quiet'.yellow, "\n")
          break
        case 'u': // upload
          // build(true)
          break
        case 'd':
          console.log("---------opts---------")
          opts.debug()

          console.log("\n---------cache---------")
          cache.debug()
          break
      }
    }
    catch(e) {
      handleError(e)
    }

    // exit
    if (key.ctrl && key.name == 'c') {
      runner.stop()
    }
  });

  resume()
}

export function resume() {
  // listen for keys
  proc.stdin.setRawMode(true);
  proc.stdin.resume();
}

export function stop() {
  proc.stdin.setRawMode(false);
  proc.stdin.pause()
}

export default {
  init,
  banner,
  resume,
  stop
}