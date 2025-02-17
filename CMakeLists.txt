cmake_minimum_required(VERSION 3.14) # Рекомендуется 3.14 или выше
project(Tinypad)

include(FetchContent)

FetchContent_Declare(
  glew
  GIT_REPOSITORY https://github.com/nigels-com/glew.git
  GIT_TAG        glew-2.2.0
)
FetchContent_MakeAvailable(glew)

FetchContent_Declare(
    glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        3.3.8
)
FetchContent_MakeAvailable(glfw)

add_executable(notepad main.cpp)

target_link_libraries(notepad glfw glew)

include_directories(${glfw_SOURCE_DIR}/include)
include_directories(${glew_SOURCE_DIR}/include)

