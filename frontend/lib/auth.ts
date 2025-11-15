export async function login(email: string, password: string) {
  // TODO: Replace with Cognito Auth later
  console.log("Login placeholder:", email, password);

  // Simulate success for now
  return { success: true, userId: "placeholder-user" };
}

export async function signup(email: string, password: string) {
  // TODO: Replace with Cognito signup later
  console.log("Signup placeholder:", email, password);

  return { success: true };
}
