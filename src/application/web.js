import express from 'express';
import cors from 'cors';
import { errorMiddleware } from '../middleware/error-middleware.js';
import publicRoute from '../route/public-route.js';
import router from '../route/api.js';
import adminRouter from '../route/admin-route.js';


export const web = express();

web.use(express.json());
web.use(cors())

web.use(publicRoute);
web.use(router);
web.use(adminRouter);

web.use(errorMiddleware);

