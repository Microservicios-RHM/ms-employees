import { Router } from "express";
import healthController from "../controllers/health.controller.ts";

class HealthRouter {
    public router: Router = Router();

    constructor() {
        this.config();
    }

    private config(): void {
        this.router.get('/health', healthController.health);
    }
}

const healthRouter = new HealthRouter();
export default healthRouter.router;