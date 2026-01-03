// firebase.js (Browser module via CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAO6W2DGPwlbpplnMRrm7P1m0aF_At5gbg",
  authDomain: "winner-form.firebaseapp.com",
  projectId: "winner-form",
  storageBucket: "winner-form.firebasestorage.app",
  messagingSenderId: "1025411543730",
  appId: "1:1025411543730:web:f836724c887d04cd478fab",
  measurementId: "G-FZ80PD6GNH"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
