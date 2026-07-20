import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { ApiKeyService } from "./ApiKeyService";
import type { ApiKeyRecord } from "./ApiKeyTypes";

/**
 * The request, extended with the authenticated API key. Handlers use
 * apiKey.brandId to scope work to the calling business.
 */
export interface ApiKeyRequest
  extends Request {
  apiKey?: ApiKeyRecord;
}

/**
 * Rejects requests without a valid X-API-Key header, and pins the
 * resolved key onto the request. Used by the SaaS Surface API, which
 * external systems call without a browser session.
 */
export function requireApiKey(
  apiKeys: ApiKeyService,
) {
  return (
    req: ApiKeyRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    const header =
      req.header("x-api-key") ??
      req.header("X-API-Key");

    const record =
      apiKeys.verify(
        header ?? undefined,
      );

    if (!record) {
      res.status(401).json({
        error: {
          code: "INVALID_API_KEY",
          message:
            "A valid X-API-Key header is required.",
        },
      });

      return;
    }

    req.apiKey = record;

    next();
  };
}
