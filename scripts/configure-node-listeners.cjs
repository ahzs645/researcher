const events = require('node:events');

const listenerLimit = 64;

if (events.defaultMaxListeners < listenerLimit) {
  events.defaultMaxListeners = listenerLimit;
}

if (process.getMaxListeners() < listenerLimit) {
  process.setMaxListeners(listenerLimit);
}
