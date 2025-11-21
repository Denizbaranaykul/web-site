import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, orderBy, onSnapshot, increment } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- AYARLAR (SENİN BİLGİLERİN) ---
const firebaseConfig = {
    apiKey: "AIzaSyCsHuUukDfNmeyLDVcjRMPnStPO36gXK4E",
    authDomain: "notlandirma-web.firebaseapp.com",
    projectId: "notlandirma-web",
    storageBucket: "notlandirma-web.firebasestorage.app",
    messagingSenderId: "970801861590",
    appId: "1:970801861590:web:679dcc499df94734d64a77"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "daykul75@gmail.com";

let myChart = null;
let currentUserData = [];
let currentUserId = "";
let currentUserName = "";

// --- GİRİŞ / ÇIKIŞ ---
window.toggleForms = () => {
    document.getElementById('login-form').classList.toggle('hidden');
    document.getElementById('register-form').classList.toggle('hidden');
}
window.login = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); }
    catch (e) { alert("Hata: " + e.message); }
}
window.register = async () => {
    const pass = document.getElementById('reg-password').value;
    if (pass.length < 6) return alert("Şifre kısa");
    try {
        const cred = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, pass);
        await addDoc(collection(db, "users"), {
            uid: cred.user.uid, name: document.getElementById('reg-name').value, email: cred.user.email, role: "student", totalScore: 0
        });
        alert("Kayıt başarılı!");
    } catch (e) { alert("Hata: " + e.message); }
}
window.logout = () => { signOut(auth); location.reload(); }

// --- AUTH DİNLEME ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('leaderboard-section').classList.remove('hidden');
        loadLeaderboard();

        if (user.email === ADMIN_EMAIL) {
            document.getElementById('admin-section').classList.remove('hidden');
            loadPendingSubmissions();
        } else {
            document.getElementById('student-section').classList.remove('hidden');
            loadStudentData(user);
        }
    } else {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('student-section').classList.add('hidden');
        document.getElementById('admin-section').classList.add('hidden');
        document.getElementById('leaderboard-section').classList.add('hidden');
    }
});

// --- ÖĞRENCİ PANELİ ---
async function loadStudentData(user) {
    // İsim bilgisini al
    const userQ = query(collection(db, "users"), where("uid", "==", user.uid));
    const userSnap = await getDocs(userQ);
    userSnap.forEach(d => {
        const data = d.data();
        currentUserName = data.name;
        document.getElementById('student-name').innerText = data.name;
        document.getElementById('student-total-score').innerText = data.totalScore;
    });

    // Ödevleri al (Tarihe göre Eskiden -> Yeniye)
    const subQ = query(collection(db, "submissions"), where("studentId", "==", user.uid), orderBy("date", "asc"));
    const subSnap = await getDocs(subQ);

    const listDiv = document.getElementById('my-submissions');
    listDiv.innerHTML = "";
    currentUserData = [];

    const tempSubmissions = [];
    subSnap.forEach(doc => tempSubmissions.push(doc.data()));

    // --- DÜZELTME BURADA ---

    // 1. GRAFİK İÇİN: Verileri "Eskiden Yeniye" (Orijinal sıra) kaydediyoruz
    tempSubmissions.forEach(data => {
        if (data.status === "graded") {
            currentUserData.push(data.totalScore);
        }
    });

    // 2. LİSTE İÇİN: Verileri "Yeniden Eskiye" (Ters) yazdırıyoruz
    [...tempSubmissions].reverse().forEach(data => {
        let details = data.details ? `<div style="font-size:0.8em; color:#666;">🧹Kod:${data.details.cleanCode} 🧠Algo:${data.details.algorithm} ⚡Perf:${data.details.performance}</div>` : "";
        let status = data.status === "graded" ? `<b style="color:green">${data.totalScore} Puan</b>` : `<span style="color:orange">Bekliyor</span>`;

        listDiv.innerHTML += `<div class="card" style="padding:10px;">
            <div style="display:flex; justify-content:space-between;"><a href="${data.githubLink}" target="_blank">GitHub</a> ${status}</div>
            <small>${new Date(data.date).toLocaleDateString()}</small> ${details}
        </div>`;
    });

    // Grafiği çiz
    drawChart([{
        name: "Sen (" + (currentUserName || "Ben") + ")",
        data: currentUserData,
        isMe: true
    }]);
}

// --- KIYASLAMA FONKSİYONU ---
window.toggleComparison = async () => {
    try {
        const isChecked = document.getElementById('compareToggle').checked;

        if (!isChecked) {
            drawChart([{
                name: "Sen (" + (currentUserName || "Ben") + ")",
                data: currentUserData,
                isMe: true
            }]);
            return;
        }

        const usersSnap = await getDocs(collection(db, "users"));
        const userNamesMap = {};
        usersSnap.forEach(doc => {
            const u = doc.data();
            const key = u.uid || doc.id;
            userNamesMap[key] = u.name || u.email;
        });

        // Puanlanmış ödevleri çek
        const q = query(collection(db, "submissions"), where("status", "==", "graded"), orderBy("date", "asc"));
        const snap = await getDocs(q);

        // Verileri garanti olsun diye JS tarafında da tarihe göre sıralayalım
        const allDocs = [];
        snap.forEach(doc => allDocs.push(doc.data()));
        allDocs.sort((a, b) => new Date(a.date) - new Date(b.date)); // Eskiden yeniye zorla

        const studentsMap = {};
        allDocs.forEach(d => {
            if (!studentsMap[d.studentId]) {
                studentsMap[d.studentId] = [];
            }
            studentsMap[d.studentId].push(d.totalScore);
        });

        const allDatasets = Object.keys(studentsMap).map(studentId => {
            const isMe = studentId === currentUserId;
            const displayName = isMe ? "SEN" : (userNamesMap[studentId] || "Öğrenci");

            return {
                name: displayName,
                data: studentsMap[studentId],
                isMe: isMe
            };
        });

        drawChart(allDatasets);

    } catch (error) {
        console.error("HATA:", error);
        if (error.message.includes("index")) {
            alert("Lütfen konsolu açıp (F12) Firebase index linkine tıklayın.");
        } else {
            alert("Hata: " + error.message);
        }
    }
}

function drawChart(datasets) {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if (myChart) myChart.destroy();

    let maxAssignments = 0;
    datasets.forEach(ds => {
        if (ds.data.length > maxAssignments) maxAssignments = ds.data.length;
    });

    const labels = [];
    for (let i = 1; i <= maxAssignments; i++) {
        labels.push(i + ". Çalışma");
    }

    const chartDatasets = datasets.map(ds => {
        const randomColor = `rgba(${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, ${Math.floor(Math.random() * 200)}, 0.5)`;

        return {
            label: ds.name,
            data: ds.data,
            borderColor: ds.isMe ? '#2980b9' : randomColor,
            backgroundColor: ds.isMe ? 'rgba(41, 128, 185, 0.1)' : 'transparent',
            borderWidth: ds.isMe ? 4 : 2,
            tension: 0.3,
            pointRadius: ds.isMe ? 5 : 3
        };
    });

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: chartDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: datasets.length > 1
                },
                tooltip: {
                    callbacks: {
                        title: (context) => context[0].label
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, suggestedMax: 100 }
            }
        }
    });
}

window.submitWork = async () => {
    const link = document.getElementById('github-link').value;
    if (!link) return alert("Link giriniz");
    const user = auth.currentUser;
    try {
        await addDoc(collection(db, "submissions"), {
            studentId: user.uid,
            studentEmail: user.email,
            studentName: currentUserName,
            githubLink: link,
            date: new Date().toISOString(),
            status: "pending",
            score: 0
        });
        alert("Gönderildi!");
        document.getElementById('github-link').value = "";
        loadStudentData(user);
    } catch (e) { console.error(e); alert("Hata"); }
}

async function loadPendingSubmissions() {
    onSnapshot(query(collection(db, "submissions"), where("status", "==", "pending")), (snap) => {
        const div = document.getElementById('pending-submissions');
        div.innerHTML = "";
        if (snap.empty) { div.innerHTML = "<p>Ödev yok.</p>"; return; }
        snap.forEach(d => {
            const data = d.data();
            div.innerHTML += `<div class="card" style="border-left:5px solid #f1c40f;">
                <strong>${data.studentName || data.studentEmail}</strong> <br> 
                <a href="${data.githubLink}" target="_blank">İncele</a> <hr>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                    <input type="number" id="c-${d.id}" placeholder="Clean"> <input type="number" id="a-${d.id}" placeholder="Algo">
                    <input type="number" id="p-${d.id}" placeholder="Perf"> <input type="number" id="e-${d.id}" placeholder="Geliş.">
                </div>
                <button onclick="giveGrade('${d.id}', '${data.studentId}')" style="margin-top:5px;">Kaydet</button>
            </div>`;
        });
    });
}

window.giveGrade = async (sid, uid) => {
    const inputs = ['c', 'a', 'p', 'e'].map(k => parseInt(document.getElementById(`${k}-${sid}`).value) || 0);
    const total = inputs.reduce((a, b) => a + b, 0);
    try {
        await updateDoc(doc(db, "submissions", sid), {
            status: "graded", totalScore: total, details: { cleanCode: inputs[0], algorithm: inputs[1], performance: inputs[2], extensibility: inputs[3] }
        });
        const uSnap = await getDocs(query(collection(db, "users"), where("uid", "==", uid)));
        uSnap.forEach(async u => await updateDoc(doc(db, "users", u.id), { totalScore: increment(total) }));
        alert("Puan: " + total);
    } catch (e) { console.error(e); alert("Hata"); }
}

async function loadLeaderboard() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("totalScore", "desc")));
    const tb = document.querySelector('#leaderboard-table tbody'); tb.innerHTML = "";
    let i = 1; snap.forEach(d => tb.innerHTML += `<tr><td>${i++}</td><td>${d.data().name}</td><td>${d.data().totalScore}</td></tr>`);
}