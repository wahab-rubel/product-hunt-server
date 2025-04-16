// ✅ Import packages
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// ✅ Initialize
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(express.json());
app.use(cors({
    origin: ["https://assignment-12-128a0.web.app", "http://localhost:5173"],
    methods: "GET,POST,PUT,DELETE,PATCH", // Added PATCH for upvote
    credentials: true
}));
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pnlgi.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1 } });

let db, usersCollection, productsCollection, couponsCollection, membershipsCollection, reviewsCollection, reportsCollection;

async function connectDB() {
    try {
        await client.connect();
        db = client.db(process.env.DB_NAME);
        usersCollection = db.collection("users");
        productsCollection = db.collection("products");
        couponsCollection = db.collection("coupons");
        membershipsCollection = db.collection("memberships");
        reviewsCollection = db.collection("reviews");
        reportsCollection = db.collection("reports");
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ DB Connection Error:", err);
    }
}
connectDB();

// ✅ Helper
const isValidObjectId = id => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

// ✅ Routes

app.get("/", (req, res) => {
    res.send("🚀 Server is running!");
});

// ✅ Signup/Login/Register
app.post("/signup", async (req, res) => {
    const { email, password } = req.body;
    const existing = await usersCollection.findOne({ email });
    if (existing) return res.status(400).json({ message: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ email, password: hashed, role: 'user' }); // Default role is 'user'
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "Registered", token });
});

// ✅ Login
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }
    const user = await usersCollection.findOne({ email });
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Logged in", token, user: { email: user.email, role: user.role } });
});

// ✅ Token Verify
app.post("/verify-token", (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token missing" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ message: "Token valid", decoded });
    } catch {
        res.status(401).json({ message: "Invalid token" });
    }
});

// ✅ Get user role
app.get("/users/role/:email", async (req, res) => {
    const { email } = req.params;
    const user = await usersCollection.findOne({ email });
    if (user?.role) {
        return res.json({ role: user.role });
    }
    res.status(404).json({ message: "User not found or role not set" });
});

// ✅ Check if user is admin
app.get("/users/admin/:email", async (req, res) => {
    const { email } = req.params;
    const user = await usersCollection.findOne({ email });
    const isAdmin = user?.role === 'admin';
    res.json({ admin: isAdmin });
});

// ✅ Product Upload (1 for non-members, unlimited for members)
app.post("/products", upload.single("productImage"), async (req, res) => {
    const { ownerEmail, productName, description, tags, externalLinks, ownerName, ownerImage } = req.body;
    const membership = await membershipsCollection.findOne({ userEmail: ownerEmail });
    const products = await productsCollection.find({ ownerEmail }).toArray();

    if ((!membership || !membership.isActive) && products.length >= 1) {
        return res.status(403).json({ message: "Buy membership to add more than 1 product" });
    }

    const productData = {
        productName,
        productImage: req.file?.buffer?.toString("base64") || null,
        description,
        tags: JSON.parse(tags),
        externalLinks,
        ownerEmail,
        ownerName,
        ownerImage,
        timestamp: new Date(),
        votes: 0,
        votedBy: [],
        reportedBy: [], // Initialize reportedBy array
        reportCount: 0, // Initialize reportCount
    };
    await productsCollection.insertOne(productData);
    res.status(201).json({ message: "Product added" });
});

// ✅ Browse Products (Paginated)
app.get("/products", async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const products = await productsCollection.find().sort({ timestamp: -1 }).skip(skip).limit(limit).toArray();
    const total = await productsCollection.countDocuments();
    res.json({ total, page, limit, products });
});

// ✅ Single Product
app.get("/products/:id", async (req, res) => {
    const id = req.params.id;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid ID" });
    const product = await productsCollection.findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ message: "Not found" });
    res.json(product);
});

// ✅ Upvote
app.patch("/products/:id/upvote", async (req, res) => {
    const id = req.params.id;
    const { userEmail } = req.body;
    const product = await productsCollection.findOne({ _id: new ObjectId(id) });

    if (!product || product.votedBy.includes(userEmail)) {
        return res.status(400).json({ message: "Already voted or not found" });
    }

    await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { votes: 1 }, $push: { votedBy: userEmail } }
    );
    res.json({ message: "Voted" });
});

// ✅ Delete Product
app.delete("/products/:id", async (req, res) => {
    const id = req.params.id;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid ID" });
    await productsCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Deleted" });
});

// ✅ Rising Products
app.get("/products/rising", async (req, res) => {
    const rising = await productsCollection.find({ votes: { $gte: 10 } }).sort({ votes: -1 }).toArray();
    res.json(rising);
});

// ✅ Coupons
app.get("/coupons", async (req, res) => {
    const coupons = await couponsCollection.find().toArray();
    res.json(coupons);
});

app.post("/coupons", async (req, res) => {
    await couponsCollection.insertOne(req.body);
    res.json({ message: "Coupon created" });
});

app.get("/coupons/:code", async (req, res) => {
    const coupon = await couponsCollection.findOne({ code: req.params.code });
    res.json(coupon);
});

app.put("/coupons/:id", async (req, res) => {
    const id = req.params.id;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid ID" });
    await couponsCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    res.json({ message: "Updated" });
});

// ✅ Memberships
app.post("/memberships", async (req, res) => {
    const { userEmail } = req.body;
    const paidAt = new Date();
    const expiresAt = new Date(paidAt);
    expiresAt.setDate(expiresAt.getDate() + 30);
    await membershipsCollection.insertOne({ userEmail, paidAt, expiresAt, isActive: true });
    res.json({ message: "Membership purchased" });
});

// ✅ Reviews
app.post("/reviews", async (req, res) => {
    await reviewsCollection.insertOne({ ...req.body, timestamp: new Date() });
    res.json({ message: "Review added" });
});

app.get("/reviews", async (req, res) => {
    const reviews = await reviewsCollection.find().sort({ timestamp: -1 }).toArray();
    res.json(reviews);
});

// ✅ Reports (Product Reporting by normal users)
app.post("/reports", async (req, res) => {
    const { productId, reporterEmail, reason } = req.body;
    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    // Check if the user has already reported this product
    if (product.reportedBy && product.reportedBy.includes(reporterEmail)) {
        return res.status(400).json({ message: "You have already reported this product" });
    }

    await productsCollection.updateOne(
        { _id: new ObjectId(productId) },
        { $inc: { reportCount: 1 }, $push: { reportedBy: reporterEmail } }
    );

    await reportsCollection.insertOne({ productId, reporterEmail, reason, reportedAt: new Date() });
    res.json({ message: "Product reported" });
});

// ✅ Get all reports (for moderators/admins)
app.get("/reports/all", async (req, res) => {
    const reports = await reportsCollection.find().sort({ reportedAt: -1 }).toArray();
    res.json(reports);
});

// ✅ Get reports for a specific product (for moderators/admins)
app.get("/reports/product/:productId", async (req, res) => {
    const { productId } = req.params;
    if (!isValidObjectId(productId)) {
        return res.status(400).json({ message: "Invalid product ID" });
    }
    const reports = await reportsCollection.find({ productId }).sort({ reportedAt: -1 }).toArray();
    res.json(reports);
});

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));