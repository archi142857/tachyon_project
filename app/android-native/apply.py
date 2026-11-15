"""Kotlin 층·홈 화면 위젯(app/android-native)을 `npx cap add android`로 만든 프로젝트에 붙인다.

실행: python3 android-native/apply.py android   (app/ 에서, CI 4단계)
두 번 돌려도 같은 결과다. 있어야 할 자리가 없으면 멈추고 0이 아닌 값으로 끝난다.
"""
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent  # app/android-native
KOTLIN_VERSION = "2.2.20"  # @capacitor/calendar 플러그인이 쓰는 판과 같게 (플러그인들도 이 판을 따른다)


def fail(message):
    sys.exit(f"apply.py 실패: {message}")


def read(path):
    if not path.exists():
        fail(f"{path} 가 없다. `npx cap add android` 를 먼저 했나?")
    return path.read_text(encoding="utf-8")


if len(sys.argv) != 2:
    fail("인자로 android 폴더 경로를 준다. 예: python3 android-native/apply.py android")
android = Path(sys.argv[1])
main = android / "app/src/main"
read(main / "AndroidManifest.xml")  # android 폴더가 맞는지 먼저 본다
for need in ["kotlin", "res", "AndroidManifest-application.xml"]:
    if not (HERE / need).exists():
        fail(f"app/android-native/{need} 가 없다")

# 1. Kotlin 코드 → src/main/java (같은 패키지 폴더 그대로)
shutil.copytree(HERE / "kotlin", main / "java", dirs_exist_ok=True)
print("1. Kotlin 코드 복사 → app/src/main/java")

# 2. 생성된 MainActivity.java 지우기 (MainActivity.kt 가 대신한다)
java_activity = main / "java/com/tachyonproject/app/MainActivity.java"
if not (main / "java/com/tachyonproject/app/MainActivity.kt").exists():
    fail("kotlin/com/tachyonproject/app/MainActivity.kt 가 없다")
if java_activity.exists():
    java_activity.unlink()
    print("2. MainActivity.java 지움")
else:
    print("2. MainActivity.java 는 이미 없음")

# 3. 위젯 화면 자원(res, 이름은 모두 widget_*) 덮어 복사
shutil.copytree(HERE / "res", main / "res", dirs_exist_ok=True)
print("3. res 복사 → app/src/main/res")

# 4. manifest 조각(receiver·service)을 </application> 바로 앞에
manifest_path = main / "AndroidManifest.xml"
manifest = read(manifest_path)
piece = (HERE / "AndroidManifest-application.xml").read_text(encoding="utf-8").strip()
if piece in manifest:
    print("4. manifest 조각은 이미 들어 있음")
elif manifest.count("</application>") != 1:
    fail("AndroidManifest.xml 에 </application> 이 하나가 아니다")
else:
    manifest_path.write_text(manifest.replace("</application>", piece + "\n    </application>"), encoding="utf-8")
    print("4. manifest 조각 넣음 (</application> 앞)")

# 5. Gradle에 Kotlin 켜기: 맨 위 build.gradle에 Kotlin 플러그인, app/build.gradle에 kotlin-android
root_path = android / "build.gradle"
root = read(root_path)
agp = "classpath 'com.android.tools.build:gradle:"
if "kotlin-gradle-plugin" in root:
    print("5. build.gradle 에 Kotlin 플러그인 이미 있음")
elif "buildscript {" not in root or agp not in root:
    fail("build.gradle 에 buildscript { 나 AGP classpath 줄이 없다 (템플릿이 바뀌었나?)")
else:
    # 플러그인들은 rootProject.ext.kotlin_version 이 있으면 그 판을 쓴다 → 판이 하나로 맞는다
    root = root.replace("buildscript {", f"buildscript {{\n    ext.kotlin_version = '{KOTLIN_VERSION}'", 1)
    line = next(l for l in root.splitlines() if agp in l)
    root = root.replace(line, line + '\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"', 1)
    root_path.write_text(root, encoding="utf-8")
    print(f"5. build.gradle 에 Kotlin 플러그인 {KOTLIN_VERSION} 넣음")

app_path = android / "app/build.gradle"
app = read(app_path)
java = re.search(r"JavaVersion\.VERSION_(\d+)", read(android / "app/capacitor.build.gradle"))
if not java:
    fail("app/capacitor.build.gradle 에서 자바 판(JavaVersion.VERSION_NN)을 못 찾았다")
if "kotlin-android" in app:
    print("6. app/build.gradle 에 kotlin-android 이미 있음")
elif "apply plugin: 'com.android.application'" not in app:
    fail("app/build.gradle 에 apply plugin: 'com.android.application' 줄이 없다")
else:
    app = app.replace("apply plugin: 'com.android.application'",
                      "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'", 1)
    # Kotlin이 만드는 바이트코드 판을 자바 판(capacitor.build.gradle)과 맞춘다. 다르면 빌드가 멈춘다
    app += ("\n// Kotlin 층(app/android-native/apply.py)\n"
            f"kotlin {{\n    compilerOptions {{ jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_{java[1]} }}\n}}\n")
    app_path.write_text(app, encoding="utf-8")
    print(f"6. app/build.gradle 에 kotlin-android 켬 (jvmTarget {java[1]})")
