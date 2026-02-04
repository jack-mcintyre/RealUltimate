import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// FIX: Ensure this path is correct (../firebaseConfig if file is in app/ folder)
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth } from '../../firebaseConfig';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  // NEW: State to show errors on screen
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const handleRegister = async () => {
    setErrorMsg(""); // Clear old errors
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Success is handled by onAuthStateChanged
    } catch (error: any) { 
      // SHOW THE ERROR ON SCREEN
      setErrorMsg(error.message);
      console.error(error); // Also try to log it
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) { 
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome Coach!</Text>
        <Text style={styles.subtitle}>{user.email}</Text>
        <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <Text style={styles.registerText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Text style={styles.title}>RealUltimate</Text>
      <Text style={styles.subtitle}>Debug Mode</Text>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Email Address"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      {/* NEW: Error Message Display Area */}
      {errorMsg ? (
        <View style={styles.errorBox}>
            <Text style={styles.errorText}>ERROR: {errorMsg}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.registerButton]} onPress={handleRegister}>
            <Text style={styles.registerText}>Create Account</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', color: '#007AFF', marginBottom: 5 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 40 },
  inputContainer: { marginBottom: 20 },
  input: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd', fontSize: 16 },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  registerButton: { backgroundColor: 'transparent', marginTop: 10, borderWidth: 1, borderColor: '#007AFF' },
  registerText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  logoutButton: { marginTop: 50, backgroundColor: 'transparent', borderColor: '#ff4444', borderWidth: 1 },
  
  // New Styles for Error Box
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ffcdd2'
  },
  errorText: {
    color: '#c62828',
    textAlign: 'center',
    fontWeight: 'bold'
  }
});