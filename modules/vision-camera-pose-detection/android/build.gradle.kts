plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.divotgolf.posedetection"
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

android.sourceSets["main"].assets.srcDirs("src/main/assets")

dependencies {
  implementation(project(":expo-modules-core"))
  implementation("com.facebook.react:react-android")
  implementation(project(":react-native-vision-camera"))
  implementation("com.google.mediapipe:tasks-vision:0.10.14")
}
