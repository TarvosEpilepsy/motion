import ReactDOMServer from 'react-dom/server'
import React from 'react'
import raf from 'raf'
import Radium from './lib/radium'

import phash from './lib/phash'
import cloneError from './lib/cloneError'
import hotCache from './mixins/hotCache'
import reportError from './lib/reportError'
import runEvents from './lib/runEvents'
import createElement from './tag/createElement'
import viewOn from './lib/viewOn'

const capitalize = str =>
  str[0].toUpperCase() + str.substring(1)

const pathWithoutProps = path =>
  path.replace(/\.[a-z0-9\-]+$/, '')

let views = {}
let viewErrorDebouncers = {}

export default function createComponent(Flint, Internal, name, view, options = {}) {
  const el = createElement(name)
  let isChanged = options.changed

  if (process.env.production)
    return createViewComponent()

  if (options.changed) {
    views[name] = createViewComponent()
  }

  // once rendered, isChanged is used to prevent
  // unnecessary props hashing, for faster hot reloads
  Flint.on('render:done', () => {
    isChanged = false
  })

  return createProxyComponent()

  // proxy components handle hot reloads
  function createProxyComponent() {
    return React.createClass({

      childContextTypes: {
        path: React.PropTypes.string,
        displayName: React.PropTypes.string
      },

      contextTypes: {
        path: React.PropTypes.string
      },

      getChildContext() {
        return {
          path: this.getPath()
        }
      },

      getPath() {
        if (!this.path) this.setPath()
        return this.path
      },

      getSep() {
        return name == 'Main' ? '' : ','
      },

      setPathKey() {
        const flint = this.props.__flint
        const key = flint && flint.key || '00'
        const index = flint && flint.index || '00'
        const parentPath = this.context.path || ''
        this.pathKey = `${parentPath}${this.getSep()}${name}-${key}/${index}`
      },

      setPath() {
        this.setPathKey()

        if (!isChanged) {
          const prevPath = Internal.paths[this.pathKey]
          if (prevPath) {
            this.path = prevPath
            return
          }
        }

        const propsHash = phash(this.props)
        this.path = `${this.pathKey}.${propsHash}`

        // for faster retrieval hot reloading
        Internal.paths[this.pathKey] = this.path
      },

      onMount(component) {
        const path = this.getPath()
        const lastRendered = component.lastRendered

        Internal.mountedViews[name] = Internal.mountedViews[name] || []
        Internal.mountedViews[name].push(this)
        Internal.viewsAtPath[path] = component

        if (lastRendered)
          Internal.lastWorkingRenders[pathWithoutProps(path)] = lastRendered

        Internal.lastWorkingViews[name] = { component }
      },

      render() {
        const View = views[name]

        let viewProps = Object.assign({}, this.props)

        viewProps.__flint = viewProps.__flint || {}
        viewProps.__flint.onMount = this.onMount
        viewProps.__flint.path = this.getPath()

        return React.createElement(View, viewProps)
      }
    })
  }

  // create view
  function createViewComponent() {
    const component = React.createClass({
      displayName: name,
      name,
      Flint,
      el,

      mixins: [hotCache({ Internal, options, name })],

      // TODO: shouldComponentUpdate based on hot load for perf
      shouldComponentUpdate() {
        return !this.isPaused
      },

      shouldUpdate(fn) {
        if (this.hasShouldUpdate) {
          reportError({ message: `You defined shouldUpdate twice in ${name}, remove one!`, fileName: `view ${name}` })
          return
        }

        this.hasShouldUpdate = true

        const flintShouldUpdate = this.shouldComponentUpdate.bind(this)

        this.shouldComponentUpdate = (nextProps) => {
          if (!flintShouldUpdate()) return false
          return fn(this.props, nextProps)
        }
      },

      // LIFECYCLES

      getInitialState() {
        const fprops = this.props.__flint

        Internal.getInitialStates[fprops ? fprops.path : 'Main'] = () => this.getInitialState()

        let u = null

        this.state = {}
        this.propDefaults = {}
        this.queuedUpdate = false
        this.firstRender = true
        this.isUpdating = true
        this.styles = { _static: {} }
        this.events = { mount: u, unmount: u, change: u, props: u }
        this.path = null

        // scope on() to view
        this.on = viewOn(this)

        // cache Flint view render() (defined below)
        const flintRender = this.render

        this.renders = []

        // setter to capture view render
        this.render = renderFn => {
          this.renders.push(renderFn)
        }

        if (process.env.production)
          view.call(this, this, this.on, this.styles)
        else {
          try {
            view.call(this, this, this.on, this.styles)
            this.recoveryRender = false
          }
          catch(e) {
            Internal.caughtRuntimeErrors++
            console.log('reporting error from getInitialState')
            reportError(e)
            console.error(e.stack || e)
            this.recoveryRender = true
          }
        }

        // reset original render
        this.render = flintRender

        if (Internal.viewDecorator)
          Internal.viewDecorator(this)

        return null
      },

      runEvents(name, args) {
        runEvents(this.events, name, args)
      },

      componentWillReceiveProps(nextProps) {
        // set timeout becuase otherwise props is mutated before shouldUpdate is run
        // setTimeout(() => {

        // main doesnt get props
        if (name != 'Main') {
          this.props = nextProps
          this.runEvents('props', [this.props])
        }
        // })
      },

      componentWillMount() {
        // run props before mount
        if (name != 'Main') {
          this.runEvents('props', [this.props])
        }
      },

      componentDidMount() {
        this.isRendering = false
        this.mounted = true
        this.isUpdating = false

        this.runEvents('mount')

        if (this.queuedUpdate) {
          this.queuedUpdate = false
          this.update()
        }

        if (name === 'Main')
          Internal.firstRender = false

        if (!process.env.production) {
          this.props.__flint.onMount(this)
          this.setID()
        }

        if (this.doRenderToRoot) {
          this.handleRootRender()
        }
      },

      componentWillUnmount() {
        // fixes unmount errors github.com/flintjs/flint/issues/60
        if (!process.env.production)
          this.render()

        this.runEvents('unmount')
        this.mounted = false

        if (this.doRenderToRoot) {
          ReactDOM.unmountComponentAtNode(this.node)
          this.app.removeChild(this.node)
        }
      },

      componentWillUpdate() {
        this.isUpdating = true
        this.runEvents('change')
      },

      setID() {
        if (Internal.isDevTools) return

        // set flintID for state inspect
        const node = ReactDOM.findDOMNode(this)
        if (node) node.__flintID = this.props.__flint.path
      },

      componentDidUpdate() {
        this.isRendering = false
        this.isUpdating = false

        if (this.queuedUpdate) {
          this.queuedUpdate = false
          this.update()
        }

        if (!process.env.production) {
          this.setID()
        }

        if (this.doRenderToRoot) {
          this.handleRootRender()
        }
      },

      // FLINT HELPERS
      // view.element('foo') -> <foo>
      element(selector) {
        return ReactDOM.findDOMNode(this).querySelector(selector)
      },
      elements(selector) {
        const els = ReactDOM.findDOMNode(this).querySelectorAll(selector)
        return Array.prototype.slice.call(els, 0)
      },

      // property declarators
      getProp(name) {
        return typeof this.props[name] === 'undefined' ?
               this.propDefaults[name] :
               this.props[name]
      },

      prop(name, defaultValue) {
        this.propDefaults[name] = defaultValue
        return this.getProp(name)
      },

      clone(el, props) {
        // TODO better checks and warnings, ie if they dont pass in element just props
        if (!el) return el
        if (typeof el !== 'object')
          throw new Error(`You're attempting to clone something that isn't a tag! In view ${this.name}. Attempted to clone: ${el}`)

        // move the parent styles source to the cloned view
        if (el.props && el.props.__flint) {
          let fprops = el.props.__flint

          fprops.parentName = this.name
          fprops.parentStyles = this.styles
        }

        return React.cloneElement(el, props)
      },

      mapElements(children, cb) {
        return React.Children.map(children, cb)
      },

      getName(child) {
        const name = child.props && child.props.__flint && child.props.__flint.tagName

        // TODO does this always work, what about with react components
        return name
      },

      // helpers for controlling re-renders
      pause() { this.isPaused = true },
      resume() { this.isPaused = false },

      // for looping while waiting
      delayUpdate() {
        if (this.queuedUpdate) return
        this.queuedUpdate = true
        this.update()
      },

      // soft = view.set()
      update(soft) {
        // view.set respects paused
        if (soft && this.isPaused)
          return

        let doUpdate = () => {
          // if during a render, wait
          if (this.isRendering || this.isUpdating || !this.mounted || Internal.firstRender) {
            this.queuedUpdate = true
          }
          else {
            // tools run into weird bug where if error in app on initial render, react gets
            // mad that you are trying to re-render tools during app render TODO: strip in prod
            // check for isRendering so it shows if fails to render
            if (!process.env.production && _Flint.firstRender && _Flint.isRendering)
              return setTimeout(this.update)

            this.isUpdating = true
            this.queuedUpdate = false

            // rather than setState because we want to skip shouldUpdate calls
            this.forceUpdate()
          }
        }

        // setTimeout fixes issues with forceUpdate during previous transition in React
        // batch changes at end of setTimeout
        if (this.queuedUpdate) return
        this.queuedUpdate = true
        setTimeout(doUpdate)
      },

      // childContextTypes: {
      //   flintContext: React.PropTypes.object
      // },
      //
      // contextTypes: {
      //   flintContext: React.PropTypes.object
      // },
      //
      // getChildContext() {
      //   console.log(name, 'get', this)
      //   return { flintContext: this._context || null }
      // },
      //
      // // helpers for context
      // setContext(obj) {
      //   if (typeof obj != 'object')
      //     throw new Error('Must pass an object to childContext!')
      //
      //   console.log(this, name, 'set', obj)
      //   this.state = { _context: obj }
      // },

      // render to a "portal"
      renderToRoot() {
        this.doRenderToRoot = true

        this.app = document.body
        this.node = document.createElement('div')
        this.node.setAttribute('data-portal', 'true')
        this.app.appendChild(this.node)
      },

      inlineStyles() {
        this.doRenderInlineStyles = true
      },

      handleRootRender() {
        ReactDOM.render(this.renderResult, this.node)
      },

      getWrapper(tags, props, numRenders) {
        const wrapperName = name.toLowerCase()

        let tagProps = Object.assign({
          isWrapper: true
        }, props)

        return this.el(`view.${name}`, tagProps, ...tags)
      },

      getRender() {
        if (this.recoveryRender)
          return this.getLastGoodRender()

        let tags, props
        let addWrapper = true
        const numRenders = this.renders && this.renders.length

        if (!numRenders) {
          tags = []
          props = { yield: true }
        }

        else if (numRenders == 1) {
          tags = this.renders[0].call(this)

          const hasMultipleTags = Array.isArray(tags)

          addWrapper = hasMultipleTags || !tags.props

          if (!hasMultipleTags && tags.props && !tags.props.root) {
            // if tag name == view name
            if (tags.props.__flint && tags.props.__flint.tagName != name.toLowerCase()) {
              addWrapper = true
              tags = [tags]
            }
          }


        }

        else if (numRenders > 1) {
          tags = this.renders.map(r => r.call(this))
        }

        // if $ = false, unwrap if possible
        // if (this.styles._static && this.styles._static.$ == false && tags.length == 1) {
        //   addWrapper = false
        //   tags = tags[0]
        // }

        // top level tag returned false
        if (!tags)
          addWrapper = true

        const wrappedTags = addWrapper ?
          this.getWrapper(tags, props, numRenders) :
          tags

        const cleanName = name.replace('.', '-')
        const viewClassName = `View${cleanName}`
        const parentClassName = wrappedTags.props.className
        const className = parentClassName
          ? `${viewClassName} ${parentClassName}`
          : viewClassName

        const withClass = React.cloneElement(wrappedTags, { className })

        return withClass
      },

      getLastGoodRender() {
        return Internal.lastWorkingRenders[pathWithoutProps(this.props.__flint.path)]
      },

      // TODO once this works better in 0.15
      // unstable_handleError(e) {
      //   console.log('ERR', e)
      //   reportError(e)
      // },

      _render() {
        const self = this

        self.isRendering = true
        self.firstRender = false

        if (process.env.production)
          return self.getRender()
        else {
          clearTimeout(viewErrorDebouncers[self.props.__flint.path])
        }

        // try render
        try {
          const els = self.getRender()
          self.lastRendered = els
          return els
        }
        catch(e) {
          Internal.caughtRuntimeErrors++

          const err = cloneError(e)
          const errorDelay = Internal.isLive() ? 1000 : 200

          // console warn, with debounce
          viewErrorDebouncers[self.props.__flint.path] = setTimeout(() => {
            console.groupCollapsed(`Render error in view ${name} (${err.message})`)
            console.error(err.stack || err)
            console.groupEnd()

            // if not in debouncer it shows even after fixing
            reportError(e)
          }, errorDelay)

          const lastRender = self.getLastGoodRender()

          try {
            let inner = <span>Error in view {name}</span>

            if (Internal.isDevTools)
              return inner

            if (lastRender) {
              let __html = ReactDOMServer.renderToString(lastRender)
              __html = __html.replace(/\s*data\-react[a-z-]*\=\"[^"]*\"/g, '')
              inner = <span dangerouslySetInnerHTML={{ __html }} />
            }

            // highlight in red and return last working render
            return (
              <span style={{ display: 'block', position: 'relative' }}>
                <span className="__flintError" />
                {inner}
              </span>
            )
          }
          catch(e) {
            console.log("Error rendering last version of view after error")
          }
        }
      },

      render() {
        let result = this._render.call(this)

        if (this.doRenderToRoot) {
          this.renderResult = result
          return <noscript />
        }
        else {
          return result
        }
      }
    })

    return Radium(component)
  }
}