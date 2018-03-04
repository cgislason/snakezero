const bodyParser = require('body-parser')
const express = require('express')
const logger = require('morgan')
const app = express()
const {
  fallbackHandler,
  notFoundHandler,
  genericErrorHandler,
  poweredByHandler
} = require('./handlers.js')
var PF = require('pathfinding')

// For deployment to Heroku, the port needs to be set using ENV, so
// we check for the port number in process.env
app.set('port', (process.env.PORT || 9001))

app.enable('verbose errors')

app.use(logger('dev'))
app.use(bodyParser.json())
app.use(poweredByHandler)

// --- SNAKE LOGIC GOES BELOW THIS LINE ---

// Handle POST request to '/start'
app.post('/start', (request, response) => {
  console.log('starting game', request.body)

  // Response data
  const data = {
    color: '#111111',
    head_url: 'https://placeimg.com/200/200/nature',
    taunt: "Hello, friends!",
    head_type: "tongue",
    tail_type: "freckled",
  }

  return response.json(data)
})

// Handle POST request to '/move'
app.post('/move', (request, response) => {
  try {

    const data = Object.assign({}, request.body, buildWorld(request.body))
    data.pathWorld = buildPathfindingWorld(data.world)
    data.paths = {}
    data.paths.food = buildFoodPaths(data.position, data)
    // data.paths.tails = buildSnakePaths(data.position, data)
    const result = calculateDirection(data)

    return response.json(result)
  } catch(e) {
    console.error(e)
    return response.json({
      move: 'up',
      taunt: 'Taking a gamble...',
    })
  }
})

// Handle POST request to '/END'
app.post('/end', (request, response) => {
  console.log('game ending', request.body)
  return response.json({})
})

app.use('*', fallbackHandler)
app.use(notFoundHandler)
app.use(genericErrorHandler)

app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'))
})

function buildSnakePaths(position, data) {
  const tails = data.snakes.data
  .filter((snake) => snake.id !== data.you.id)
  .map((snake) => {
    return snake.body.data[snake.body.data.length - 1]
  })
  return buildPaths(position, data.pathWorld, tails, 'tails')
}

function buildFoodPaths(position, data) {
  return buildPaths(position, data.pathWorld, data.food.data, 'food')
}

function buildPaths(position, pathWorld, points, type) {
  const paths = []
  for (let point of points) {
    // TODO: this is ugly
    // const oldVal = pathWorld[point.x][point.y]
    // pathWorld[point.x][point.y] = 0
    const grid = new PF.Grid(pathWorld)
    const finder = new PF.DijkstraFinder({
      allowDiagonal: false
    })
    let path = []
    console.log('position', position)
    try {
      path = finder.findPath(position.x, position.y, point.x, point.y, grid)
    } catch (e) {
      console.log('pathing exception', e)
    }
    if (path.length > 0) {
      paths.push(path)
      console.log('pathing from', position.x, position.y, 'to', type, point.x, point.y)
      console.log(path)
    } else {
      console.log('ignoring pathing from', position.x, position.y, 'to', type, point.x, point.y)
    }
    // pathWorld[point.x][point.y] = oldVal
  }
  return paths
}

function buildPathfindingWorld(world) {
  let pathWorld = []
  for(let x = 0; x < world.length; x++) {
    pathWorld[x] = []
    for(let y = 0; y < world[x].length; y++) {
      pathWorld[x][y] = world[x][y].blocked ? 1 : 0
    }
  }
  return pathWorld
}


function buildWorld(data) {
  let world = makeArray(data.width, data.height)

  const snakeMap = {}
  for(let snake of data.snakes.data) {
    snakeMap[snake.id] = snake
    // Ignore dead snakes
    if (snake.health === 0) {
      break
    }
    for(let point of snake.body.data) {
      world[point.x][point.y] = {
        val: snake.id[0],
        type: 'snake',
        id: snake.id,
        blocked: true,
      }
    }
    // mark potential move spots
    if (snake.id !== data.you.id) {
      world = markHead(world, snake, data.you.length)
    }
  }

  for(let food of data.food.data) {
    world[food.x][food.y] = {
      type: 'food',
      val:'f',
      blocked: false,
    }
  }

  const position = data.you.body.data[0]

  return {
    world,
    snakeMap,
    position
  }
}

function markHead(world, snake, ourLength) {
  const head = snake.body.data[0]
  let newWorld = world
  const points = allDirections.map((dir) => movePoint(head, dir))
  console.log('head points', points)
  for(let p of points) {
    console.log('marking head?', isSafe(p, world), p, getDebugValue(p, world))
    if (isSafe(p, world)) {
      const danger = snake.length >= ourLength
      world[p.x][p.y] = {
        type: 'snake_move',
        val: danger ? '!' : '?',
        id: snake.id,
        danger,
        blocked: danger,
      }
    }
  }
  return world
}

function makeArray(width, height) {
  const world = []
  for(let x = 0; x < width; x++) {
    world[x] = []
    for(let y = 0; y < height; y++) {
      world[x][y] = {}
    }
  }

  return world
}

function printWorld(world) {
  try {
    console.log('  ' + Array.from(Array(world.length).keys()).map((val) => `${val}`.padStart(2)).join(''))
    for(let y = 0; y < world[0].length; y++) {
      let rowStr = `${y} `.padStart(3)
      for(let x = 0; x < world.length; x++) {
        const val = world[x][y].val
        rowStr += val || '-'
        rowStr += ' '
      }
      console.log(rowStr)
    }
  } catch(e) {
    console.error('failed to log world', e)
  }
}

const offsets = {
  'up': {x: 0, y: -1},
  'left': {x: -1, y: 0},
  'down': {x: 0, y: 1},
  'right': {x: 1, y: 0},
}
const defaultMoves = {
  0: 'up',
  1: 'left',
  2: 'down',
  3: 'right',
}
const allDirections = ['up', 'left', 'down', 'right']

function calculateDirection(data) {
  printWorld(data.world)
  console.log('snake position:', data.position)

  let safestMoves = []
  let bestScore = 0
  for(let direction of allDirections) {
    const point = movePoint(data.position, direction)
    const danger = calculateDanger(point, data.world)
    const desirability = calculateDesirability(data, point, data.world)
    const score = (1-danger) * (desirability + 1)
    console.log('score:\t\t', score, '\ndanger:\t\t', danger, 'safe = (',(1-danger),')', '\ndesirability\t', desirability)
    let value = undefined
    try {
      value = getDebugValue(point, data.world)
    } catch(e) {}
    console.log('danger?', data.you.id[0], data.position, direction, point, danger, value)
    if (score > bestScore) {
      safestMoves = []
      bestScore = score
    }
    if (score === bestScore) {
      safestMoves.push({
        move: direction,
        score,
      })
    }
  console.log('safestMoves', safestMoves)
  }

  let bestDirection = safestMoves[0] || { move: 'up', score: -1 }
  if (safestMoves.length > 1) {
    const random = Math.floor(Math.random() * Math.floor(safestMoves.length))
    bestDirection = safestMoves[random]
  }
  console.log('bestDirection', bestDirection)
  return {
    move: bestDirection.move,
    taunt: `Rollin rollin rollin... ${bestDirection.score} ${bestDirection.move}`,
  }
}
function movePoint(point, direction) {
  const change = offsets[direction]
  return {
    x: point.x + change.x,
    y: point.y + change.y,
  }
}

function getDebugValue(point, world) {
  if (point.x < 0) {
    return '-x'
  }
  if (point.y < 0) {
    return '-y'
  }
  if (point.y >= world[0].length) {
    return '+y'
  }
  if (point.x >= world.length) {
    return '+x'
  }

  return world[point.x][point.y].val
}

function isOutOfBounds(point, world) {
  return point.x < 0 || point.y < 0 || point.x >= world.length || point.y >= world[0].length
}

function isSafe(point, world) {
  if (isOutOfBounds(point, world)) {
    return false
  }

  // Empty or food
  const result = world[point.x][point.y].val
  return result === undefined || result === 'f'
}

function calculateDesirability(data, point, world) {
  console.log(data.paths.food.map((path) => {
    return path[1]
  }), point)
  const matchingPaths = data.paths.food.filter((path) => {
    if (path.length===0) return false;
    const pathPoint = path[1]
    return pathPoint[0] === point.x && pathPoint[1] === point.y
  })

  // const min = 10000
  // for (path of matchingPaths) {
  //   if (path.length < min) {
  //     min = path.length
  //   }
  // }
  // return 10000 - min
  return matchingPaths.length
}

function calculateDanger(point, world) {
  if (isOutOfBounds(point, world)) {
    return 1.0
  }

  // Empty or food
  const result = world[point.x][point.y]

  // TODO: what if another snake can move here?
  if (result.type === 'food') {
    return 0.0
  }

  if (result.type === 'snake') {
    return 1.0
  }

  if (result.type === 'snake_move') {
    return result.danger ? 0.9 : 0.1
  }

  return 0.0
}
