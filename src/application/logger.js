import winston from "winston";


export const loggerApp = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({})
  ]
});

