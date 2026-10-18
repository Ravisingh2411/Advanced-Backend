import Redis from "ioredis";
import express from "express";
import dotenv from "dotenv";
import connectDB from "./lib/db.js";
import userModel from "./models/user.model.js";
import rateLimitter from "./middlewares/ratelimit.js";
import emailQueue from "./queue.js";
dotenv.config();

const port = process.env.PORT || 5000;

const app = express();

export const redis = new Redis(process.env.REDIS_URL)

app.use(express.json()); 
app.get("/", (req, res) => {
    return res.status(200).json({message: `hello from ${process.env.SERVER_NAME}`});
})

app.post("/create", async (req, res) => {
    const {name, email, password} = req.body;
    await redis.del("user:all");
    const user = await userModel.create({
        name, email, password
    })
    await emailQueue.add("send-email", {email});
    return res.status(201).json({message: "user created successfully", user})
})

app.get("/get", rateLimitter, async (req, res) => {
    const user = await userModel.find({});
    return res.json(user);
})

app.get("/get-with-redis", async (req, res) => {
    const cached = await redis.get("user:all");
    
    if(cached){
        console.log("from redis");
        return res.json(JSON.parse(cached));
    }

    const user = await userModel.find({});

    await redis.set("user:all", JSON.stringify(user));
    return res.json(user);
})

app.post("/send-otp", async (req, res) => {
    const {email} = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await redis.set(`otp:${email}`, otp, "EX", 30); 

    return res.json({message: "OTP sent successfully", otp});
})

app.post("/verify-otp", async (req, res) => {
    const {email, otp} = req.body;

    const cachedOtp = await redis.get(`otp:${email}`);

    if(!cachedOtp){
        return res.status(400).json({message: "otp not found or expired"});
    }

    if(cachedOtp !== otp){
        return res.status(400).json({message: "otp is invalid"});
    }

    await redis.del(`otp:${email}`);
    return res.json({message: "otp verified successfully"});
})

app.listen(port, () => {
    connectDB();
    console.log(`Server started at ${port}`);
})

