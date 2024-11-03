import type { NextFunction, Request, Response, Handler } from "express";
import {
	isAuthorizationSchemeValid,
	getAuthorizationToken,
} from "passkit-webservice-toolkit/v1/utils/auth.js";

export function assertAuthorizationSchemeValid(
	request: Request,
	response: Response,
	next: NextFunction,
): void {
	const { authorization = "" } = request.headers;

	if (!isAuthorizationSchemeValid(authorization)) {
		response
			.status(401)
			.send(
				`Apple Schema validation for Authorization header failed. Received: '${authorization}'`,
			);
		return;
	}

	next();
}

export function assertTokenValid(
	verifyToken?: (token: string) => PromiseLike<boolean>,
): Handler {
	return async function (
		request: Request,
		response: Response,
		next: NextFunction,
	) {
		if (typeof verifyToken !== "function") {
			next();
			return;
		}

		const { authorization = "" } = request.headers;

		const token = getAuthorizationToken(authorization);

		if (!(await verifyToken(token))) {
			console.warn(
				`Authorization token validation failed. Received: ${authorization}`,
			);
			response.status(401).send();
			return;
		}

		next();
	};
}

// export function createResponsePayloadValidityCheckerHook(
// 	expectedType: string,
// 	predicate: (payload: unknown, code: number) => boolean,
// ): onSendHookHandler<unknown> {
// 	return async function payloadValidityCheckerHook<Payload>(
// 		_: FastifyRequest,
// 		reply: FastifyReply,
// 		payload: Payload,
// 	) {
// 		const result = predicate(payload, reply.statusCode);

// 		if (!result) {
// 			throw new Error(
// 				`Unexpected outcoming payload type. Expected a '${expectedType}' but returning ${result}`,
// 			);
// 		}

// 		return payload;
// 	};
// }
