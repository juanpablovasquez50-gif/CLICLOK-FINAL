import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clickOkRouter from "./click-ok";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clickOkRouter);

export default router;
