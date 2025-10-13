const admin = require("firebase-admin");
const serviceAccount = require("../path-to-your-service-account.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = "USER_UID_HERE"; // replace with the user's UID

async function setRole() {
  try {
    await admin.auth().setCustomUserClaims(uid, { role: "manager" });
    console.log(`Role "manager" set for user ${uid}`);
  } catch (error) {
    console.error(error);
  }
}

setRole();
