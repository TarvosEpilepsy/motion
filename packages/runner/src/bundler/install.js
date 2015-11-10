import { Promise } from 'bluebird'
import _ from 'lodash'
import readWritten from './lib/readWritten'
import writeInstalled from './lib/writeInstalled'
import handleError from '../lib/handleError'
import log from '../lib/log'
import cache from '../cache'
import opts from '../opts'
import { onStart, onFinish, onError } from './lib/messages'
import { save } from './lib/npm'
import normalize from './lib/normalize'
import remakeInstallDir from './lib/remakeInstallDir'
import { uninstall } from './uninstall'
import { bundleExternals } from './externals'
import { bundleInternals } from './internals'

// ensures all packages installed, uninstalled, written out to bundle
export async function install(force) {
  log('npm: install')
  try {
    await remakeInstallDir(force)
    await uninstall()
    await installAll()
    await bundleExternals()

    if (force) {
      await bundleInternals()
    }
  } catch(e) {
    handleError(e)
    throw new Error(e)
  }
}

let successful = []
let failed = []
let installingFullNames = []
let installing = []
let _isInstalling = false

export async function installAll(deps) {
  try {
    if (!deps) deps = cache.getImports()
    log('installing...', deps)

    // full names keeps paths like 'babel/runtime/etc'
    if (deps.length)
      installingFullNames.push(deps)

    const prevInstalled = await readWritten()
    const fresh = _.difference(normalize(deps), normalize(prevInstalled), installing)
    log('installAll() fresh = ', fresh)

    // no new ones found
    if (!fresh.length) {
      if (!_isInstalling) opts.set('hasRunInitialInstall', true)
      return
    }

    // push installing
    installing = installing.concat(fresh)

    // check if installed running
    if (_isInstalling) return
    _isInstalling = true

    const installNext = async () => {
      const dep = installing[0]
      onStart(dep)

      try {
        await save(dep)
        successful.push(dep)
        onFinish(dep)
      }
      catch(e) {
        failed.push(dep)
        log('package install failed', dep)
        onError(dep, e)
      }
      finally {
        installing.shift() // remove
        next()
      }
    }

    function next() {
      if (installing.length)
        installNext()
      else
        done()
    }

    async function done() {
      const installedFullPaths = _.flattenDeep(_.compact(_.uniq(installingFullNames)))
      let final = [].concat(prevInstalled, installedFullPaths)

      // remove failed
      if (failed.length)
        final = final.filter(dep => failed.indexOf(dep) >= 0)

      logInstalled(successful)
      await writeInstalled(final)
      await bundleExternals()

      // reset
      installingFullNames = []
      failed = []
      _isInstalling = false
      opts.set('hasRunInitialInstall', true)
    }

    installNext()
  }
  catch(e) {
    handleError(e)
  }
}

function logInstalled(deps) {
  if (!deps.length) return
  console.log()
  console.log(`  Installed ${deps.length} packages`.bold)
  deps.forEach(dep => {
    console.log(`  ✓ ${dep}`.green)
  })
  console.log()
}

// check for install finish
export function finishedInstalling() {
  return new Promise(finishedInstallingLoop)
}

function isInstalling() {
  return _isInstalling
}

function finishedInstallingLoop(res) {
  if (!_isInstalling) res()
  else {
    setTimeout(() => finishedInstallingLoop(res), 100)
  }
}