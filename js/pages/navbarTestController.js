// This controller is just for the test page.
// Its only job is to import the navbar to register it and initialize auth.

import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';

// Initialize authentication. The navbar's internal initAuth call will then
// receive the auth state and render correctly.
initAuth(() => {
    console.log('Auth state changed on test page.');
});