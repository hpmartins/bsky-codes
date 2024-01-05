import 'module-alias/register';
import 'dotenv/config';
import { connectDb } from '../common/db';
import express from 'express';

import feedGeneration from './methods/feed-generation';
import describeGenerator from './methods/describe-generator';
import wellKnown from './well-known';
import { createServer } from '../common/lexicon';
import { maybeInt, maybeStr } from '../common';

export type AppContext = {
    cfg: Config;
    log: (text: string) => void;
};

export type Config = {
    port: number;
    listenhost: string;
    hostname: string;
    serviceDid: string;
    publisherDid: string;
};

const run = async () => {
    await connectDb();

    const hostname = maybeStr(process.env.FEEDER_HOSTNAME) ?? 'example.com';
    const serviceDid = `did:web:${hostname}`;

    const cfg: Config = {
        port: maybeInt(process.env.FEEDER_PORT) ?? 3000,
        listenhost: maybeStr(process.env.FEEDER_HOST) ?? 'localhost',
        hostname: hostname,
        serviceDid: serviceDid,
        publisherDid: maybeStr(process.env.FEEDER_PUBLISHER_DID) ?? ''
    };

    const app = express();
    const server = createServer({
        validateResponse: true,
        payload: {
            jsonLimit: 100 * 1024, // 100kb
            textLimit: 100 * 1024, // 100kb
            blobLimit: 5 * 1024 * 1024 // 5mb
        }
    });

    const log = (text: string) => {
        console.log(`[${new Date().toLocaleTimeString()}] [feeder] ${text}`);
    };

    const ctx: AppContext = {
        cfg,
        log
    };

    feedGeneration(server, ctx);
    describeGenerator(server, ctx);
    app.use(server.xrpc.router);
    app.use(wellKnown(ctx));

    app.listen(cfg.port, () => {
        ctx.log(`listening @ :${cfg.port}`);
    });
};

run();
