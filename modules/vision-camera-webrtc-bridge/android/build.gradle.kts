plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.swinglink.visioncamerawebrtcbridge"
  compileSdk = 35

  defaultConfig {
    minSdk = 24
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  implementation(project(":expo-modules-core"))
  implementation("com.mrousavy:react-native-vision-camera:4.7.3")
  implementation("com.oney:react-native-webrtc:124.0.7")
  implementation("org.webrtc:google-webrtc:1.0.32006")
}
