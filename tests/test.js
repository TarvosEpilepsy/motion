import assert from 'assert'
import jsdom from 'jsdom'

import motionNew from '../packages/cli/lib/modern/lib/new'
import runner from '../packages/runner/lib/modern/index'

try {

cd('tests')

const appName = '.tmp'

motionNew({
  name: appName,
  nocache: true
})

cd(appName)

testRunner()

async function testRunner() {
  const opts = await runner()
  const port = opts.port

  console.log('url',  `http://localhost/:${port}`)
  jsdom.env({
    url: `http://localhost:${port}/`,
    scripts: [`http://code.jquery.com/jquery.js`],
    done: domTests
  })
}

function domTests(err, window) {
  if (err) throw new Error(err)

  const $ = window.$
  const Motion = window.Motion
  const Internal = window.Internal

  Motion.on('after:render', () => {
    console.log('rendered')
  })

  // console.log($('h1').first())
  // assert($('h1')[0].text() == 'Hello world!')
}

// catch whole thing
}
catch(e) {
  console.error(e)
  console.error(e.stack)
}