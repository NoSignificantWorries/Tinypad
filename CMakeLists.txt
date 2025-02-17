
cmake_minimum_required(VERSION 2.8)

project(tinypad)
add_executable(tinypad main.cpp)
find_package(OpenGL REQUIRED)
find_package(GLUT REQUIRED)
include_directories( ${OPENGL_INCLUDE_DIRS}  ${GLUT_INCLUDE_DIRS})

target_link_libraries(tinypad ${OPENGL_LIBRARIES} ${GLUT_LIBRARY})

