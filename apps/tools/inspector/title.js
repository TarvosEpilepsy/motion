view Inspector.Title {
  let open = true

  function toggle() {
    if (!view.props.onToggle) return
    open = !open
    view.props.onToggle(open)
  }

  <title onClick={toggle}>
    <inner>{view.props.children}</inner>
  </title>

  $title = {
    fontWeight: 300,
    borderBottom: '1px solid #f4f4f4',
    height: 10,
    margin: [0, 5, 4],
    color: '#999',
    flexFlow: 'row',
  }

  $closed = {
    transform: { scale: 0.8 },
    marginTop: 1
  }

  $inner = {
    padding: [4, 10],
    background: '#fff',
    margin: [-2, 'auto']
  }
}