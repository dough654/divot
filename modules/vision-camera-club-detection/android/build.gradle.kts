plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.swinglink.clubdetection"
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

  // Include TFLite model from assets
  sourceSets {
    getByName("main") {
      assets.srcDirs("src/main/assets")
    }
  }
}

dependencies {
  implementation(project(":expo-modules-core"))
  implementation("com.facebook.react:react-android")
  implementation(project(":react-native-vision-camera"))
  implementation("org.tensorflow:tensorflow-lite:2.14.0")
  implementation("org.tensorflow:tensorflow-lite-gpu:2.14.0")
}
