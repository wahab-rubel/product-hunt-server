const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(express.json());

app.use(cors({
  origin: ["http://localhost:5173", "https://your-frontend.netlify.app"], 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true, 
}));
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ MongoDB URI and Client Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pnlgi.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1 } });

let db, usersCollection, productsCollection, couponsCollection, membershipsCollection;

async function connectDB() {
  try {
    // await client.connect();
    db = client.db(process.env.DB_NAME);
    usersCollection = db.collection("users");
    productsCollection = db.collection("products");
    couponsCollection = db.collection("coupons");
    membershipsCollection = db.collection("memberships");
    console.log("✅ MongoDB Connected Successfully!");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error);
  }
}
connectDB();

// ✅ Helper function to validate ObjectId
const isValidObjectId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;


// ✅ User Signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) return res.status(400).json({ message: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  await usersCollection.insertOne({ email, password: hashedPassword });

  // Create token
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ message: "User registered successfully", token });
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) return res.status(400).json({ message: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  await usersCollection.insertOne({ email, password: hashedPassword });

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ message: "User registered successfully", token });
});

app.post("/verify-token", (req, res) => {
  const token = req.body.token;
  if (!token) return res.status(400).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({ message: "Token verified", decoded });
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
});

app.post("/products", upload.single("productImage"), async (req, res) => {
  const { ownerEmail, productName, description, tags, externalLinks, ownerName, ownerImage } = req.body;

  const membership = await membershipsCollection.findOne({ userEmail: ownerEmail });
  const userProducts = await productsCollection.find({ ownerEmail }).toArray();

  if ((!membership || !membership.isActive) && userProducts.length >= 1) {
    return res.status(403).json({ message: 'Only 1 product allowed. Buy membership to add more.' });
  }

  const productData = {
    productName,
    productImage: req.file.buffer.toString("base64"),
    description,
    tags: JSON.parse(tags),
    externalLinks,
    ownerName,
    ownerImage,
    ownerEmail,
    timestamp: new Date(),
    votes: 0,
    votedBy: [],
  };
  await productsCollection.insertOne(productData);
  res.status(201).json({ message: "Product added successfully" });
});

app.get('/products', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const products = await productsCollection.find().skip(skip).limit(limit).toArray();
  const total = await productsCollection.countDocuments();
  
  res.json({ total, page, limit, products });
});

app.post('/api/products/:id/upvote', (req, res) => {
  const productId = req.params.id;
  const userId = req.body.userId;
  console.log(`Product ID: ${productId}, User ID: ${userId}`);
  // handle logic
  res.json({ success: true, updatedVotes: 5 }); 
});

app.patch('/products/:id/upvote', async (req, res) => {
  const { userId } = req.body;
  const { id } = req.params;
  
  const product = await product.findById(id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  
  if (product.votedBy.includes(userId)) {
     return res.status(400).json({ error: "Already voted" });
  }
  
  product.votes += 1;
  product.votedBy.push(userId);
  await product.save();

  res.json({ success: true, updatedVotes: product.votes });
});

app.get('/products/rising', async (req, res) => {
  try {
    const risingProducts = await productsCollection.find({ votes: { $gte: 10 } }).toArray();
    res.json({ success: true, risingProducts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch rising products', error: error.message });
  }
});

app.get('/myproducts', async (req, res) => {
  const email = req.query.email;
  const userProducts = await productsCollection.find({ userEmail: email }).toArray();
  res.send(userProducts);
});

app.get("/products/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid product ID format' });

  const product = await productsCollection.findOne({ _id: new ObjectId(id) });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

app.delete("/products/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid product ID format' });

  const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) return res.status(404).json({ message: 'Product not found to delete' });

  res.json({ message: 'Product deleted successfully', result });
});

app.get('/coupons', async (req, res) => {
  try {
    const coupons = await couponsCollection.find().toArray();
    res.status(200).json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch coupons', error: error.message });
  }
});

app.post('/coupons', async (req, res) => {
  try {
    const { code, expiryDate, description, discount } = req.body;
    if (!code || !expiryDate || !description || !discount) {
      return res.status(400).json({ success: false, message: 'All fields are required: code, expiryDate, description, discount' });
    }

    const coupon = { code, expiryDate, description, discount };
    const result = await couponsCollection.insertOne(coupon);
    res.status(201).json({ success: true, message: 'Coupon created successfully', couponId: result.insertedId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create coupon', error: error.message });
  }
});

app.get('/coupons/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const coupon = await couponsCollection.findOne({ code });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    res.status(200).json({ success: true, coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch coupon', error: error.message });
  }
});

app.put('/coupons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon ID format' });
    }

    const { code, expiryDate, description, discount } = req.body;
    if (!code || !expiryDate || !description || !discount) {
      return res.status(400).json({ success: false, message: 'All fields are required: code, expiryDate, description, discount' });
    }

    const updatedCoupon = {
      $set: { code, expiryDate, description, discount }
    };

    const result = await couponsCollection.updateOne({ _id: new ObjectId(id) }, updatedCoupon);

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Coupon not found for update' });
    }

    res.status(200).json({ success: true, message: 'Coupon updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update coupon', error: error.message });
  }
});

app.delete('/coupons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon ID format' });
    }

    const result = await couponsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Coupon not found to delete' });
    }

    res.status(200).json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete coupon', error: error.message });
  }
});

app.get('/memberships', async (req, res) => {
  const memberships = await membershipsCollection.find().toArray();
  res.status(200).json(memberships);
});

// ✅ Membership Plans (CRUD)

// ➤ Get All Memberships
app.get('/memberships', async (req, res) => {
  try {
    const memberships = await membershipsCollection.find().toArray();
    res.status(200).json(memberships);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch memberships', error });
  }
});

// ➤ Create New Membership Plan
app.post('/memberships', async (req, res) => {
  try {
    const membership = req.body;
    const result = await membershipsCollection.insertOne(membership);
    res.status(201).json({ message: 'Membership plan created successfully', membershipId: result.insertedId });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create membership plan', error });
  }
});

// ➤ Get Single Membership Plan by ID
app.get('/memberships/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid membership ID format' });

  try {
    const membership = await membershipsCollection.findOne({ _id: new ObjectId(id) });
    if (!membership) return res.status(404).json({ message: 'Membership not found' });
    res.status(200).json(membership);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch membership', error });
  }
});

// ➤ Delete Membership Plan by ID
app.delete('/memberships/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid membership ID format' });

  try {
    const result = await membershipsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Membership not found to delete' });
    res.status(200).json({ message: 'Membership deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete membership', error });
  }
});

// ✅ Get Statistics
app.get("/stats", async (req, res) => {
  try {
    const totalProducts = await productsCollection.countDocuments();
    const allProducts = await productsCollection.find().toArray();
    const totalVotes = allProducts.reduce((sum, product) => sum + (product.votes || 0), 0);
    const acceptedProducts = await productsCollection.countDocuments({ status: "Accepted" });
    const rejectedProducts = await productsCollection.countDocuments({ status: "Rejected" });
    const pendingProducts = await productsCollection.countDocuments({ status: { $ne: "Accepted", $ne: "Rejected" } });
    const mostVotedProduct = await productsCollection.find().sort({ votes: -1 }).limit(1).toArray();

    res.json({
      totalProducts,
      totalVotes,
      acceptedProducts,
      rejectedProducts,
      pendingProducts,
      mostVotedProduct: mostVotedProduct[0] || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch statistics", error });
  }
});

app.get('/users', async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

app.patch('/users/admin/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { role: 'admin' } };
  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.patch('/users/moderator/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { role: 'moderator' } };
  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});


// Route to approve a product
app.patch('/products/approve/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  // Check if status is provided
  if (!status) {
    return res.status(400).send({ error: true, message: 'Status is required' });
  }

  try {
    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: status } }
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true, message: 'Product approved successfully', result });
    } else {
      res.status(404).send({ success: false, message: 'Product not found or already approved' });
    }
  } catch (error) {
    console.error('Error approving product:', error);
    res.status(500).send({ success: false, message: 'Internal server error' });
  }
});


app.get('/admin/statistics', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalAcceptedProducts = await Product.countDocuments({ status: 'accepted' });
    const totalPendingProducts = await Product.countDocuments({ status: 'pending' });
    const totalReviews = await Review.countDocuments();
    const totalUsers = await User.countDocuments();

    res.json({
      totalProducts,
      totalAcceptedProducts,
      totalPendingProducts,
      totalReviews,
      totalUsers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/reported-products', async (req, res) => {
  const reportedProducts = await Product.find({ reported: true });
  res.send(reportedProducts);
});


app.get('/api/coupons', (req, res) => {
  res.json({
    coupons: [
      {
        _id: "1",
        code: "DISCOUNT20",
        description: "20% off",
        discount: 20,
        expiryDate: "2025-03-30"
      }
    ]
  });
});

app.get("/", (req, res) => {
  res.send("🚀 Product Hunt API is running!");
});

// ✅ Start the Server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
