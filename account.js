document.getElementById('register-form').addEventListener('submit', function(event) {
    event.preventDefault();
    var username = document.getElementById('reg-username').value;
    var password = document.getElementById('reg-password').value;

    // Use these values to make a request to your server
    console.log('Register:', username, password);
});

document.getElementById('login-form').addEventListener('submit', function(event) {
    event.preventDefault();
    var username = document.getElementById('log-username').value;
    var password = document.getElementById('log-password').value;

    // Use these values to make a request to your server
    console.log('Login:', username, password);
});
