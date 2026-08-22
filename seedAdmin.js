const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://azartechnet_db_user:admin@cluster0.musk1ed.mongodb.net/codingadmin";
async function seed() {
  await mongoose.connect(MONGO_URI);
  const UserSchema = new mongoose.Schema({ name: String, email: { type: String, unique: true }, password: String, role: String, center: String }, { strict: false });
  const User = mongoose.models.User || mongoose.model("User", UserSchema);
  const email = "admin@codeassess.com";
  const existing = await User.findOne({ email });
  if (existing) { console.log("Admin already exists"); process.exit(0); }
  const hash = await bcrypt.hash("Admin@1234", 10);
  await User.create({ name: "Admin", email, password: hash, role: "admin", center: "" });
  console.log("Admin created! Email: admin@codeassess.com  Password: Admin@1234");
  process.exit(0);
}
seed().catch(err => { console.error(err); process.exit(1); });
