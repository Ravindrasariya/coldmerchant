import type { Request, Response, RequestHandler } from "express";
import { storage, type IStorage } from "./storage";

/** Buffer JSON until commit; validation failures roll back all earlier writes. */
export function seedWriteHandler(
  handler: (req: Request, res: Response, scoped: IStorage) => Promise<unknown>,
): RequestHandler {
  return async (req, res, next) => {
    let status = 200;
    let body: unknown;
    const response = Object.create(res) as Response;
    response.status = (code: number) => { status = code; return response; };
    response.json = (value: unknown) => { body = value; return response; };
    const rejected = new Error("Seed edit rejected");
    try {
      await storage.withSeedWriteTransaction(req.user!.merchantId!, async scoped => {
        await handler(req, response, scoped);
        if (status >= 400) throw rejected;
      });
      res.status(status).json(body);
    } catch (error) {
      if (error === rejected) res.status(status).json(body);
      else next(error);
    }
  };
}