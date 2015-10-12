import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import ejs from 'ejs-mate';
import session from 'express-session';
import SessionStore from 'express-mysql-session';
import serveStatic from 'serve-static';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import glob from 'glob';

import logger from '../logger';
//import routers from './routers';
import config from '../../config';

var app = express();
let SERVER_ENV = app.get('env');
let env_name = SERVER_ENV === 'production' ? 'production' : 'dev';
global.server_config = config[env_name];

app.use(morgan('short'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json({limit: 100000000}));
app.use(require('method-override')());

// views
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'html');
app.engine('html', ejs);
app.enable('trust proxy');

// 生产环境启用缓存
if(env_name === 'production'){
    app.enable('view cache');
}

// 当前环境
app.locals.isProduction = (env_name === 'production');

// 生产环境直接读取根目录
if(env_name === 'production') {
    app.use(serveStatic(path.join(__dirname, '../public')));
} else {
    app.use(serveStatic('./dest'));
}

app.use(compression());
app.use(cookieParser('vwdirect'));
// session 存到mysql中
let mysqlConfig = config[env_name].mysql;
app.use(session({
    secret: 'vwdirect',
    store: new SessionStore({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        user: mysqlConfig.username,
        password: mysqlConfig.password,
        database: mysqlConfig.database,
        schema: {
            tableName: 'node_session',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data'
            }
        }
    }),
    resave: true,
    saveUninitialized: true
}));

let routers = {};
var routersDir = path.join(__dirname, 'routers');
glob.sync(routersDir + '/**/*.js').forEach((file, index) => {
    routers[index] = require(file);
});

// routers
(function iterateRouters (routers) {
    for (let key in routers) {
        if (Object.getPrototypeOf(routers[key])['route']) {
            app.use('/', routers[key]);
        } else {
            iterateRouters(routers[key]);
        }
    }
})(routers);

app.use(logger.use());

// 404
app.use((req, res, next) => {
    res.status(404).end();
});

// 500
app.use((error, req, res) => {
    var statusCode = error.statusCode || 500;
    var err = {
        error: statusCode,
        message: error.message
    };
    if (!res.headersSent) {
        res.status(statusCode).send(err);
    }
});


export default app;