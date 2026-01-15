// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAO6W2DGPwlbpplnMRrm7P1m0aF_At5gbg",
  authDomain: "winner-form.firebaseapp.com",
  projectId: "winner-form",
  storageBucket: "winner-form.firebasestorage.app",
  messagingSenderId: "1025411543730",
  appId: "1:1025411543730:web:f836724c887d04cd478fab",
  measurementId: "G-FZ80PD6GNH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);