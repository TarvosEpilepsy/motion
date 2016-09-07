import React from 'react'
import niceStyles from 'motion-nice-styles'
import { StyleSheet, css } from 'aphrodite/no-important'
import { omit, identity, pickBy, zip, flatten } from 'lodash'
// import console from 'console'

// flatten theme key
// { theme: { dark: { h1: { color: 'red' } } } }
// => { dark-button: { h1: { color: 'red' } } }
const flattenThemes = styles => {
  if (!styles.theme) return styles
  let result = styles

  Object.keys(styles.theme).forEach(themeKey => {
    const themeStyles = styles.theme[themeKey]

    if (typeof themeStyles === 'object') {
      result = {
        ...result,
        // flatten themes to `theme-tag: {}`
        ...Object.keys(themeStyles)
            .reduce((res, key) => ({ ...res, [`${themeKey}-${key}`]: themeStyles[key] }), {})
      }
    } else if (typeof themeStyles === 'function') {
      // skip function themes
      return
    } else {
      console.log(`Note: themes must be an object or function, "${themeKey}" is a ${typeof themeKey}`)
    }
  })

  delete result.theme
  return result
}

const applyNiceStyles = (styles, themeKey) => {
  for (const style in styles) {
    if (!styles.hasOwnProperty(style) || style === themeKey) {
      continue
    }
    const value = styles[style]
    if (value) {
      styles[style] = niceStyles(value)
    }
  }

  return styles
}

const isFunc = x => typeof x === 'function'
const filterStyleKeys = arr => arr.filter(key => key[0] === '$' && key[1] !== '$')
const filterParentStyleKeys = arr => arr.filter(key => key[0] === '$' && key[1] === '$')
const joinZip = (a, b) => flatten(zip(a, b))

module.exports = function motionStyle(opts = {
  theme: true,
  themeKey: 'theme'
}) {
  // helpers
  const makeNiceStyles = styles => applyNiceStyles(styles, opts.themeKey)
  const getDynamicStyles = (active, props, styles, propPrefix = '$') => {
    const dynamicKeys = active.filter(k => styles[k] && typeof styles[k] === 'function')
    const dynamicsReduce = (acc, k) => ({ ...acc, [k]: styles[k](props[`${propPrefix}${k}`]) })
    const dynamics = dynamicKeys.reduce(dynamicsReduce, {})
    return dynamics
  }

  const getDynamicSheets = dynamics => {
    const sheet = StyleSheet.create(makeNiceStyles(dynamics))
    return Object.keys(dynamics).map(k => sheet[k])
  }

  const processStyles = _styles => {
    const preprocess = opts.theme ? flattenThemes : identity
    const styles = preprocess(Object.assign({}, _styles))
    const dynamics = pickBy(styles, isFunc)
    const statics = pickBy(styles, x => !isFunc(x))

    return {
      statics: StyleSheet.create(makeNiceStyles(statics)),
      dynamics,
      theme: _styles.theme
    }
  }

  // decorator
  const decorator = (Child, parentStyles) => {
    if (!Child.style && !parentStyles) return Child

    const styles = Child.style ? processStyles(Child.style) : null
    const hasOwnStyles = !!styles

    return class StyledComponent extends Child {
      static displayName = Child.displayName || Child.name

      __styles = styles

      render() {
        return this.styleAll.call(this, super.render())
      }

      styleAll(children) {
        if (!children || !Array.isArray(children) && !children.props) return children

        const styler = this.styleOne.bind(this)
        if (Array.isArray(children)) {
          return children.map(styler)
        }

        const count = React.Children.count(children)
        if (count > 1) {
          return React.Children.map(children, styler)
        }

        return styler(children)
      }

      styleOne(child) {
        if (Array.isArray(child)) return this.styleAll(child)
        if (!child || !React.isValidElement(child)) return child

        // <name $one $two /> keys
        const propKeys = Object.keys(child.props)
        const styleKeys = filterStyleKeys(propKeys)

        // remove $
        const activeKeys = styleKeys
          .filter(key => child.props[key] !== false && typeof child.props[key] !== 'undefined')
          .map(key => key.slice(1))

        // tag + $props
        // don't style <Components />!
        const isTag = typeof child.type === 'string'
        const name = child.type
        const allKeys = isTag ? [name, ...activeKeys] : activeKeys
        let finalKeys = [...allKeys]

        // collect styles
        let finalStyles = []

        //
        // theme styles
        //
        if (hasOwnStyles && opts.theme) {
          const themeKeys = prop => allKeys.map(k => `${prop}-${k}`)
          const addTheme = (keys, prop) => joinZip(keys, themeKeys(prop))

          // theme=""
          if (opts.themeKey && this.props[opts.themeKey]) {
            finalKeys = addTheme(finalKeys, this.props[opts.themeKey])
          }

          // direct
          const themeProps = this.constructor.themeProps
          if (themeProps && themeProps.length) {
            themeProps.forEach(prop => {
              if (this.props[prop] === true) {
                // static theme
                finalKeys = addTheme(finalKeys, prop)
              } else if (
                typeof this.props[prop] !== 'undefined' &&
                styles.theme[prop]
              ) {
                // dynamic themes
                const dynStyles = getDynamicStyles([prop], this.props, styles.theme, '')[prop]

                if (dynStyles) {
                  finalStyles = [...finalStyles, ...getDynamicSheets(dynStyles)]
                }
              }
            })
          }
        }

        //
        // parent styles
        //
        let parentStyleKeys = []
        if (parentStyles) {
          parentStyleKeys = filterParentStyleKeys(propKeys)

          if (parentStyleKeys.length) {
            const keys = parentStyleKeys.map(k => k.replace('$$', ''))

            // dynamic
            if (parentStyles.dynamics) {
              finalStyles = [
                ...finalStyles,
                ...getDynamicSheets(getDynamicStyles(keys, child.props, parentStyles.dynamics, '$$'))
              ]
            }

            // static
            if (parentStyles.statics) {
              finalStyles = [
                ...finalStyles,
                ...keys.map(k => parentStyles.statics[k])
              ]
            }
          }
        }

        //
        // own styles
        //
        // static
        if (hasOwnStyles) {
          if (styles.statics) {
            finalStyles = [...finalStyles, ...finalKeys.map(i => styles.statics[i])]
          }

          // dynamic
          if (styles.dynamics && activeKeys.length) {
            finalStyles = [
              ...finalStyles,
              ...getDynamicSheets(getDynamicStyles(activeKeys, child.props, styles.dynamics))
            ]
          }
        }

        //
        // finish
        //
        // recreate child (without style props)
        const { key, ref, props, type } = child
        const newProps = omit(props, [...styleKeys, ...parentStyleKeys])
        if (ref) newProps.ref = ref
        if (key) newProps.key = key

        if (finalStyles.length) {
          // apply styles
          newProps.className = css(...finalStyles)

          // keep original classNames
          if (props && props.className && typeof props.className === 'string') {
            newProps.className += ` ${props.className}`
          }
        }

        // recurse to children
        if (newProps && newProps.children) {
          newProps.children = this.styleAll(child.props.children)
        }

        return React.createElement(type, newProps)
      }
    }
  }

  decorator.parent = styles => {
    const parentStyles = processStyles(styles)
    return Child => decorator(Child, parentStyles)
  }

  return decorator
}