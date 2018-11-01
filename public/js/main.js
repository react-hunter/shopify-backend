/* eslint-env jquery, browser */
$(document).ready(() => {
  console.log('document ready');
  // Place JavaScript code here...
  $("#users-table").DataTable();
  $("#vendors-table").DataTable();

  $('.delete-item').on('click', function (e) {
    e.preventDefault();
    console.log(e);
    var result = confirm("Are you sure to delete this?");
    if (!result) {
      return false;
    } else {
      console.log(e);
    }
  });

});