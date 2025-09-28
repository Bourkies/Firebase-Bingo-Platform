import { signInWithGoogle, signInAnonymously } from '../../core/auth.js';

export function initializeLoginModal() {
    document.querySelector('#login-modal .close-button').addEventListener('click', closeLoginModal);
    document.getElementById('login-google').addEventListener('click', () => { signInWithGoogle(); closeLoginModal(); });
    document.getElementById('login-anon').addEventListener('click', () => { signInAnonymously(); closeLoginModal(); });
    document.body.addEventListener('login-request', openLoginModal);
}

export function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}
export function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}