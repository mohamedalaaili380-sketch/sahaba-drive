import { EventEmitter } from 'node:events'

export const bus = new EventEmitter()
bus.setMaxListeners(0)

export const emit = (event, payload) => bus.emit(event, payload)
