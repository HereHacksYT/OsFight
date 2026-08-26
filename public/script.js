import * as THREE from 'three';

// Socket.io bağlantısı
const socket = io();

// Global değişkenler
let scene, camera, renderer;
let players = {}; // Diğer oyuncuların 3D modelleri
let myPlayerMesh;
let myUsername = '';
let selectedFriend = null;

// Klavye durumu
const keys = {};

// Giriş fonksiyonu
window.girisYap = function() {
    const isimInput = document.getElementById('isimInput');
    const username = isimInput.value.trim();
    if (!username) return alert('İsim girmelisin!');

    myUsername = username;
    socket.emit('login', username);
};

// Socket olayları
socket.on('login_success', (data) => {
    document.getElementById('girisEkrani').style.display = 'none';
    document.getElementById('oyunEkrani').style.display = 'block';
    document.getElementById('oyuncuAdi').textContent = `⚔️ ${data.username}`;
    baslat3D();
    guncelleArkadasListesi(data.friends);
});

socket.on('update_online_users', (onlineUsers) => {
    document.getElementById('onlineSayisi').textContent = `Online: ${onlineUsers.length}`;
});

socket.on('add_friend_success', (friendName) => {
    alert(`${friendName} arkadaş listene eklendi!`);
    // Listeyi güncelle (sunucudan tekrar isteyebilirsin)
    socket.emit('request_friends');
});

socket.on('add_friend_error', (msg) => {
    alert(msg);
});

socket.on('friend_added_you', (friendName) => {
    alert(`${friendName} seni arkadaş olarak ekledi!`);
});

socket.on('receive_message', (msg) => {
    const mesajlarDiv = document.getElementById('mesajlar');
    const yeniMesaj = document.createElement('div');
    yeniMesaj.innerHTML = `<strong>${msg.from}:</strong> ${msg.message}`;
    mesajlarDiv.appendChild(yeniMesaj);
    mesajlarDiv.scrollTop = mesajlarDiv.scrollHeight;
});

socket.on('player_moved', (data) => {
    if (players[data.username]) {
        players[data.username].position.set(
            data.position.x,
            data.position.y,
            data.position.z
        );
    }
});

// Arkadaş listesini güncelle
function guncelleArkadasListesi(friends) {
    const ul = document.getElementById('arkadasUl');
    ul.innerHTML = '';
    friends.forEach(friend => {
        const li = document.createElement('li');
        li.textContent = friend;
        li.onclick = () => {
            selectedFriend = friend;
            document.getElementById('mesajInput').placeholder = `${friend} yaz...`;
        };
        ul.appendChild(li);
    });
}

// Arkadaş ekle
window.arkadasEkle = function() {
    const friendName = prompt('Arkadaşının kullanıcı adını gir:');
    if (friendName) socket.emit('add_friend', friendName);
};

// Mesaj gönder
window.mesajGonder = function() {
    const input = document.getElementById('mesajInput');
    const message = input.value.trim();
    if (!message || !selectedFriend) return alert('Önce bir arkadaş seç!');
    socket.emit('send_message', { to: selectedFriend, message: message });
    input.value = '';
};

// Karakter seç
window.karakterSec = function() {
    alert('Karakter seçimi yakında!');
};

// Başla
window.basla = function() {
    alert('OsFight başladı! W-A-S-D ile hareket et.');
};

// 3D sahne
function baslat3D() {
    const container = document.getElementById('canvasContainer');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Işık
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Zemin
    const planeGeo = new THREE.PlaneGeometry(50, 50);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = Math.PI / 2;
    plane.position.y = -0.5;
    scene.add(plane);

    // Benim karakterim (küp)
    const myGeo = new THREE.BoxGeometry(1, 1, 1);
    const myMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
    myPlayerMesh = new THREE.Mesh(myGeo, myMat);
    myPlayerMesh.position.y = 0.5;
    scene.add(myPlayerMesh);

    // Diğer oyuncular için başlangıçta boş
    players = {};

    // Klavye dinleyicileri
    window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

    // Animasyon döngüsü
    function animate() {
        requestAnimationFrame(animate);

        // Hareket
        if (myPlayerMesh) {
            const speed = 0.1;
            if (keys['w']) myPlayerMesh.position.z -= speed;
            if (keys['s']) myPlayerMesh.position.z += speed;
            if (keys['a']) myPlayerMesh.position.x -= speed;
            if (keys['d']) myPlayerMesh.position.x += speed;

            // Sunucuya pozisyon gönder (saniyede 10 kez)
            socket.emit('update_position', {
                x: myPlayerMesh.position.x,
                y: myPlayerMesh.position.y,
                z: myPlayerMesh.position.z
            });
        }

        // Kamera karakteri takip etsin
        camera.position.x = myPlayerMesh.position.x;
        camera.position.z = myPlayerMesh.position.z + 10;
        camera.lookAt(myPlayerMesh.position);

        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}
