cmake_minimum_required(VERSION 3.14) # Рекомендуется 3.14 или выше
project(Tinypad)

include(FetchContent)

# GLEW (пример с FetchContent, но рекомендуется find_package если возможно)
FetchContent_Declare(
  glew
  GIT_REPOSITORY https://github.com/nigels-com/glew.git
  GIT_TAG        glew-2.2.0  # Или другая нужная версия
)
FetchContent_MakeAvailable(glew)

# GLFW
FetchContent_Declare(
    glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        3.3.8  # Или другая нужная версия
)
FetchContent_MakeAvailable(glfw)


# Добавить исполняемый файл
add_executable(notepad main.cpp)

# Связать библиотеки
target_link_libraries(notepad glfw glew)

# Include Directories (если необходимо, так как FetchContent обычно делает это автоматически)
include_directories(${glfw_SOURCE_DIR}/include)
include_directories(${glew_SOURCE_DIR}/include)

