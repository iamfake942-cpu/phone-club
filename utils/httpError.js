function httpError(message, statusCode = 500) {
  console.log(message);
  console.log("erorr......")
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = httpError;
