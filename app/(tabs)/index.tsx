import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
// This imports the database connection from the file you made in the main folder
import { ref, set } from 'firebase/database';
import { db } from '../../firebaseConfig';

export default function HomeScreen() {
  const [status, setStatus] = useState("Connecting to RealUltimate DB...");

  useEffect(() => {
    // 1. Create a reference to a specific spot in your database
    const testRef = ref(db, 'connectionTest');
    
    // 2. Try to write a timestamp to that spot
    set(testRef, {
      connected: true,
      timestamp: Date.now(),
      message: "Hello from the RealUltimate App!"
    })
    .then(() => setStatus("SUCCESS: Connected to Firebase!"))
    .catch((error) => setStatus("FAILED: " + error.message));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RealUltimate: Alpha</Text>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333'
  }
});