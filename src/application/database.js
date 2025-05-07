
import { PrismaClient } from '@prisma/client';
import { loggerApp } from './logger.js';

const prismaClient = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

prismaClient.$on('query', (e) => {
  loggerApp.info(e);
});

prismaClient.$on('error', (e) => {
  loggerApp.error(e);
});

prismaClient.$on('info', (e) => {
  loggerApp.info(e);
});

prismaClient.$on('warn', (e) => {
  loggerApp.warn(e);
});

export {
    prismaClient
};