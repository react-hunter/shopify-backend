var CHARACTER_SETS = [
  [true, "Numbers", "0123456789"],
  [true, "Lowercase", "abcdefghijklmnopqrstuvwxyz"],
  [false, "Uppercase", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  [false, "ASCII symbols", "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"]
];

/* eslint-env jquery, browser */
$(document).ready(() => {
  // Place JavaScript code here...
  $("#users-table").DataTable();
	$("#vendors-table").DataTable();
	$("#systemstatus-table").DataTable();
	$("#history-table").DataTable();

  $('.delete-item').on('click', function (e) {
    e.preventDefault();
    var result = confirm("Are you sure to delete this?");
    if (!result) {
      return false;
    } else {
      return true;
    }
  });

});

var passwordElem   = document.getElementById("password");
var confirmpasswordElem = document.getElementById("confirmpassword");
var cryptoObject    = null;
var currentPassword = null;

function newPassword() {
  var charset = getPasswordCharacterSet();
	currentPassword = generatePassword(charset, 8);
	
	// Set output elements
  passwordElem.value = currentPassword;
  confirmpasswordElem.value = currentPassword;
}

/*---- Low-level functions ----*/

function getPasswordCharacterSet() {
	// Concatenate characters from every checked entry
	var rawCharset = "";
	CHARACTER_SETS.forEach(function(entry, i) {
		rawCharset += entry[2];
	});
	rawCharset = rawCharset.replace(/ /g, "\u00A0");  // Replace space with non-breaking space
	
	// Parse UTF-16, remove duplicates, convert to array of strings
	var charset = [];
	for (var i = 0; i < rawCharset.length; i++) {
		var c = rawCharset.charCodeAt(i);
		if (c < 0xD800 || c >= 0xE000) {  // Regular UTF-16 character
			var s = rawCharset.charAt(i);
			if (charset.indexOf(s) == -1)
				charset.push(s);
			continue;
		}
		if (0xD800 <= c && c < 0xDC00 && i + 1 < rawCharset.length) {  // High surrogate
			var d = rawCharset.charCodeAt(i + 1);
			if (0xDC00 <= d && d < 0xE000) {  // Low surrogate
				var s = rawCharset.substring(i, i + 2);
				i++;
				if (charset.indexOf(s) == -1)
					charset.push(s);
				continue;
			}
		}
		throw "Invalid UTF-16";
	}
	return charset;
}

function generatePassword(charset, len) {
	var result = "";
	for (var i = 0; i < len; i++)
		result += charset[randomInt(charset.length)];
	return result;
}

// Returns a random integer in the range [0, n) using a variety of methods.
function randomInt(n) {
	var x = randomIntMathRandom(n);
	x = (x + randomIntBrowserCrypto(n)) % n;
	return x;
}

// Not secure or high quality, but always available.
function randomIntMathRandom(n) {
	var x = Math.floor(Math.random() * n);
	if (x < 0 || x >= n)
		throw "Arithmetic exception";
	return x;
}

// Uses a secure, unpredictable random number generator if available; otherwise returns 0.
function randomIntBrowserCrypto(n) {
	if (cryptoObject == null)
		return 0;
	// Generate an unbiased sample
	var x = new Uint32Array(1);
	do cryptoObject.getRandomValues(x);
	while (x[0] - x[0] % n > 4294967296 - n);
	return x[0] % n;
}
