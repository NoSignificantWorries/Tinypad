#ifndef SHADER_H
#define SHADER_H

#include <string>
#include <fstream>
#include <sstream>
#include <iostream>

#include <GL/glew.h>;

class Shader {
private:
    GLuint Program;
public:
    Shader(const GLchar* vertexPath, const GLchar* fragmentPath);
    void Use();

    GLuint getProgram() const;
};

#endif

