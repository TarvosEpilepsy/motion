import React from 'react'
import niceStyles from 'motion-nice-styles'
import { StyleSheet, css } from 'aphrodite'

const filterObject = (obj, cond) => Object.keys(obj)
  .filter(item => cond(obj[item]))
  .reduce((acc, cur) => ({ ...acc, [cur]: obj[cur] }), {})

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
    } else {
      console.log(`Note: themes must be an object, "${themeKey}" isn't an object`)
    }
  })

  delete result.theme
  return result
}

// TODO: rewrite functionally
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

module.exports = function motionStyle(opts = {
  theme: true,
  themeKey: 'theme'
}) {
  const makeNiceStyles = styles => applyNiceStyles(styles, opts.themeKey)

  return Child => {
    if (!Child.style) return Child

    let styles = { ...Child.style }

    // flatten themes
    styles = opts.theme ? flattenThemes(styles) : styles

    // split dynamic
    const dynamicStyles = filterObject(styles, isFunc)
    const staticStyles = filterObject(styles, x => !isFunc(x))

    styles = {
      static: StyleSheet.create(makeNiceStyles(staticStyles)),
      dynamic: dynamicStyles
    }

    return class StyledComponent extends Child {
      static displayName = Child.displayName || Child.name

      __staticStyles = styles.static
      __dynamicStyles = null

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

        // <View /> + <tag /> keys
        const name = child.type && (child.type.name || child.type)

        // <name $tag /> keys
        const tags = Object.keys(child.props)
          // only leading $
          .filter(key => key[0] === '$' && child.props[key] !== false && typeof child.props[key] !== 'undefined')
          // remove $
          .map(key => key.slice(1))

        // tag + $props
        const allKeys = [name, ...tags]
        let styleKeys = [...allKeys]

        // add theme keys
        if (opts.theme) {
          const addTheme = (keys, prop) => [...keys, ...allKeys.map(k => `${prop}-${k}`)]

          // theme prop
          if (opts.themeKey && this.props[opts.themeKey]) {
            styleKeys = addTheme(styleKeys, this.props[opts.themeKey])
          }

          // boolean prop
          const themeProps = this.constructor.themeProps
          if (themeProps && themeProps.length) {
            themeProps.forEach(prop => {
              if (this.props[prop]) styleKeys = addTheme(styleKeys, prop)
            })
          }
        }

        // add static styles
        let final = styleKeys.map(i => styles.static[i])

        // add dynamic styles
        if (styles.dynamic && tags.length) {
          // gather
          const dynamicKeys = tags.filter(k => styles.dynamic[k])
          // run
          const dynamics = dynamicKeys.reduce((acc, k) => ({
            ...acc,
            [k]: styles.dynamic[k](child.props[`$${k}`])
          }), {})
          // make sheet
          const dynamicSheet = StyleSheet.create(makeNiceStyles(dynamics))
          // expose to public
          this.__dynamicStyles = dynamicSheet
          // add to final list
          final = [...final, ...dynamicKeys.map(k => dynamicSheet[k])]
        }

        // gather properties to be cloned
        const cloneProps = {}

        if (final.length) {
          // apply styles
          cloneProps.className = css(...final)

          // keep original classNames
          if (child.props && child.props.className) {
            if (typeof child.props.className === 'string') {
              cloneProps.className += ` ${child.props.className}`
            }
          }
        }

        // recurse to children
        if (child.props && child.props.children) {
          cloneProps.children = this.styleAll(child.props.children)
        }

        return React.cloneElement(child, cloneProps)
      }
    }
  }
}
