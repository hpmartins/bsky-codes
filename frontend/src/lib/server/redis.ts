import { REDIS_URI } from '$env/static/private';
import Redis from 'ioredis';
export default REDIS_URI ? new Redis(REDIS_URI) : new Redis();
