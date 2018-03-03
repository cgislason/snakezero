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
    color: '#E77431',
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
    const data = Object.assign(request.body ,buildWorld(request.body))
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
app.post('/END', (request, response) => {
  console.log('game ending', request.body)
  return response.json({})
})

app.use('*', fallbackHandler)
app.use(notFoundHandler)
app.use(genericErrorHandler)

app.listen(app.get('port'), () => {
  console.log('Server listening on port %s', app.get('port'))
})


function buildWorld(data) {
  let world = makeArray(data.width, data.height)
  // console.log('all data', JSON.stringify(data, null, 2))

  const snakeMap = {}
  for(let snake of data.snakes.data) {
    snakeMap[snake.id] = snake
    // Ignore dead snakes
    if (snake.health === 0) {
      break
    }
    for(let point of snake.body.data) {
      world[point.x][point.y] = snake.id[0]
    }
    // mark potential move spots
    if (snake.id !== data.you.id) {
      world = markHead(world, snake.body.data[0])
    }
  }

  for(let food of data.food.data) {
    world[food.x][food.y] = 'f'
  }

  const position = data.you.body.data[0]

  return {
    world,
    snakeMap,
    position
  }
}

function markHead(world, head) {
  let newWorld = world
  const points = allDirections.map((dir) => movePoint(head, dir))
  console.log('head points', points)
  for(let p of points) {
    console.log('marking head?', isSafe(p, world), p, getDebugValue(p, world))
    if (isSafe(p, world)) {
      world[p.x][p.y] = '?'
    }
  }
  return world
}

function makeArray(x, y) {
  return Array(...Array(x)).map(() => Array(...Array(y)));
}

function printWorld(world) {
  try {
    console.log('  ' + Array.from(Array(world.length).keys()).map((val) => `${val}`.padStart(2)).join(''))
    for(let y = 0; y < world.length; y++) {
      let rowStr = `${y} `.padStart(3)
      for(let x = 0; x < world[0].length; x++) {
        const val = world[x][y]
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
  // Default move is to go circular
  let move = defaultMoves[data.turn % 4]

  console.log('snake position:', data.position)
  printWorld(data.world)

  for(let direction of allDirections) {
    const testPoint = movePoint(data.position, direction)
    const safe = isSafe(testPoint, data.world)
    let value = undefined
    try {
      value = getDebugValue(testPoint, data.world)
    } catch(e) {}
    console.log('safe?', data.you.id[0], data.position, direction, testPoint, safe, value)
    if (safe) {
      move = direction
      break;
    }
  }

  return {
    move,
    taunt: 'Rollin rollin rollin...',
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

  return world[point.x][point.y]
}

function isOutOfBounds(point, world) {
  return point.x < 0 || point.y < 0 || point.x >= world.length || point.y >= world[0].length
}

function isSafe(point, world) {
  if (isOutOfBounds(point, world)) {
    return false
  }

  // Empty or food
  const result = world[point.x][point.y]
  return result === undefined || result === 'f'
}
