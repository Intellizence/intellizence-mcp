import config from '../core/config.js';

import {
    createRemoteJWKSet,
    jwtVerify
} from 'jose';

const AUTH0_DOMAIN = config.auth0.domain;
const AUDIENCE = config.auth0.audience;

const JWKS =
    createRemoteJWKSet(
        new URL(
            `https://${AUTH0_DOMAIN}/.well-known/jwks.json`
        )
    );

export async function verifyAuth0Token(req) {

    try {

        const auth =
            req.headers.authorization;

        if (!auth?.startsWith('Bearer ')) {

            return {
                ok: false,
                message: 'Missing bearer token'
            };
        }

        const token =
            auth.replace('Bearer ', '');

        const { payload } =
            await jwtVerify(
                token,
                JWKS,
                {
                    issuer:
                        `https://${AUTH0_DOMAIN}/`,
                    audience: AUDIENCE
                }
            );

        return {
            ok: true,
            payload
        };

    } catch (err) {
        return {
            ok: false,
            message: 'Invalid token'
        };
    }
}