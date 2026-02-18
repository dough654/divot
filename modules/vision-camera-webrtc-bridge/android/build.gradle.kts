plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.divotgolf.visioncamerawebrtcbridge"
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
  implementation("com.facebook.react:react-android")
  implementation(project(":react-native-vision-camera"))
  implementation(project(":react-native-webrtc"))
}
