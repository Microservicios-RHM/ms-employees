import type { Request, Response } from "express";

class HealthController {
    public health(_req: Request, res: Response): void {
        res.status(200).type('text/plain').send('OK');
    }
}

const healthController = new HealthController();
export default healthController;